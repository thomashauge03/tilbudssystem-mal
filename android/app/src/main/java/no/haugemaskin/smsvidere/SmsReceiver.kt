package no.haugemaskin.smsvidere

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.provider.Telephony
import android.util.Log
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fanger opp innkommende SMS og sender teksten videre til tilbudssystemet.
 *
 * Meldingene fra anbudsåpningene er lange og kommer derfor som flere SMS-deler.
 * Android leverer alle delene i det samme intentet, og de MÅ settes sammen før
 * de sendes — sender vi hver del for seg, blir protokollen delt midt i en linje
 * og tolkeren ser bare halve tabellen.
 *
 * Sendingen kan gå i vasken: ingen dekning, flymodus, WiFi uten internett,
 * endepunktet nede. Appen har ikke READ_SMS og kan ikke hente teksten fra
 * telefonen en gang til, så da er protokollen borte for godt. Derfor legges
 * meldingen i en kø på disk FØR sendingen prøves, og blir liggende til
 * tilbudssystemet har kvittert. Køen tømmes på nytt av en purring fra
 * AlarmManager, og av enhver innkommende SMS.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val erSms = intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION
        if (!erSms && intent.action != PURRING) return

        val innst = Innstillinger(context)
        if (!innst.erKlar()) return

        if (erSms) {
            val deler = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (deler != null && deler.isNotEmpty()) {
                val avsender = deler[0].originatingAddress ?: ""
                val tekst = deler.joinToString("") { it.messageBody ?: "" }
                if (skalSendes(innst, avsender, tekst)) Sendeko.leggTil(context, avsender, tekst)
            }
        }

        // Enhver innkommende SMS er også en anledning til å tømme køen — også en
        // melding vi ikke skal sende videre: da har telefonen nettopp hatt
        // kontakt med nettet.
        if (Sendeko.antall(context) == 0) return

        // Nettverk kan ikke gjøres på hovedtråden, og onReceive er ferdig med én
        // gang. goAsync() holder prosessen i live til sendingen er gjort.
        val pendingResult = goAsync()
        Thread {
            try {
                tomKoen(context, innst, erSms)
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    /**
     * Avsenderfilteret er det treffsikre: protokollene kommer alltid fra samme
     * avsender. Ordfilteret er et ekstra sikkerhetsnett. Står et av feltene
     * tomt, slipper alt gjennom det filteret.
     */
    private fun skalSendes(innst: Innstillinger, avsender: String, tekst: String): Boolean {
        val ventetAvsender = innst.avsender.trim()
        if (ventetAvsender.isNotEmpty() && !avsenderMatcher(avsender, ventetAvsender)) return false

        val filter = innst.filter.trim()
        if (filter.isNotEmpty() && !tekst.contains(filter, ignoreCase = true)) return false

        return true
    }

    /**
     * Sender køen i den rekkefølgen meldingene kom inn. En melding fjernes bare
     * når systemet har svart 2xx — eller når svaret er så avvisende at et nytt
     * forsøk aldri kan gå bedre. Ved første melding som ikke går gjennom stopper
     * vi: rekkefølgen skal holdes, og er nettet nede feiler resten uansett.
     */
    private fun tomKoen(context: Context, innst: Innstillinger, fraSms: Boolean): Unit = synchronized(Sendeko.tommelaas) {
        // Hele tømmingen holder låsen, ikke bare hvert enkelt oppslag i køen.
        // Hver kringkasting gir en ny mottakerinstans og en ny tråd, så purringen
        // kan fyre midt i en innkommende SMS. Uten denne låsen kunne to tråder
        // hente samme melding med forste(), sende den hver sin gang, og fjern()
        // nummer to gjorde ingenting — resultatet var samme anbudsprotokoll to
        // ganger i innboksen. Vinduet er stort fordi send() venter opptil 15 s,
        // altså nettopp når nettet er dårlig og køen er i bruk.
        var sendt = 0
        var sisteSvar = 0
        var feil: String? = null

        while (true) {
            val melding = Sendeko.forste(context) ?: break
            try {
                val svar = send(innst.url, innst.token, melding.fra, melding.tekst)
                sisteSvar = svar
                if (svar in 200..299) {
                    Sendeko.fjern(context, melding.id)
                    sendt++
                    continue
                }
                // 400 er «tom melding» fra endepunktet. Den teksten blir ikke
                // bedre av å sendes en gang til, og ville ellers blokkert køen
                // for meldingene bak. Alt annet — 401 på feil nøkkel, 5xx,
                // gatewayen som svarer 401 fordi funksjonen ble rullet ut uten
                // --no-verify-jwt — kan rettes opp, og meldingen blir liggende.
                if (svar == 400) {
                    Sendeko.fjern(context, melding.id)
                    Log.w(TAG, "Endepunktet avviste meldingen (HTTP 400)")
                    Logg.skriv(context, "Avvist av systemet (HTTP 400) — forkastet")
                    continue
                }
                feil = "HTTP $svar"
            } catch (e: Exception) {
                Log.e(TAG, "Klarte ikke å sende", e)
                feil = e.message ?: e.javaClass.simpleName
            }
            break
        }

        if (sendt > 0) {
            Log.i(TAG, "Sendte $sendt melding(er), siste svar $sisteSvar")
            Logg.skriv(
                context,
                if (sendt == 1) "Sendt ($sisteSvar)" else "Sendte $sendt meldinger ($sisteSvar)",
            )
        }

        val igjen = Sendeko.antall(context)
        if (igjen == 0) {
            Sendeko.nullstillForsok(context)
            avlysPurring(context)
            return
        }

        // Bare det første mislykkede forsøket logges. Ellers spiser purringene
        // opp hele hendelseslista på ti linjer før brukeren rekker å åpne appen.
        val forsok = Sendeko.okForsok(context)
        if (fraSms || forsok == 1) {
            Logg.skriv(context, "Ligger i kø: $igjen (${feil ?: "ingen kontakt"})")
        }
        planleggPurring(context, forsok)
    }

    /**
     * Purringen er en alarm til vår egen mottaker. Den krever verken ny
     * tillatelse eller et nytt bibliotek, og setAndAllowWhileIdle slipper
     * gjennom også når telefonen har lagt seg til å sove. Pausene øker, slik at
     * en telefon som ligger uten dekning en hel dag ikke tapper batteriet.
     */
    private fun planleggPurring(context: Context, forsok: Int) {
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pause = PAUSER_MS[minOf(forsok, PAUSER_MS.size) - 1]
        try {
            alarm.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + pause,
                purreIntent(context),
            )
        } catch (e: Exception) {
            // Purringen er et ekstra sikkerhetsnett. Blir den ikke planlagt,
            // ligger meldingen fortsatt i køen og går ut ved neste SMS.
            Log.w(TAG, "Fikk ikke planlagt nytt forsøk", e)
        }
    }

    private fun avlysPurring(context: Context) {
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        try {
            alarm.cancel(purreIntent(context))
        } catch (e: Exception) {
            Log.w(TAG, "Fikk ikke avlyst purringen", e)
        }
    }

    /** Eksplisitt intent til vår egen mottaker — den trenger ikke stå i filteret. */
    private fun purreIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            1,
            Intent(context, SmsReceiver::class.java).setAction(PURRING),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    companion object {
        private const val TAG = "SmsVidere"

        /** Vår egen handling: «prøv å tømme køen på nytt». */
        const val PURRING = "no.haugemaskin.smsvidere.SEND_KO"

        /** 1 min, 5 min, 15 min, 1 time, 6 timer — deretter hver 6. time. */
        private val PAUSER_MS = longArrayOf(
            60_000L, 5 * 60_000L, 15 * 60_000L, 60 * 60_000L, 6 * 60 * 60_000L,
        )

        /**
         * Avsenderen kan være et navn («HaugeMaskin») eller et nummer, og
         * nummeret kommer med eller uten landkode og med vilkårlige mellomrom.
         * Derfor sammenlignes de siste åtte sifrene når begge er tall, og ellers
         * tekstinnhold uten mellomrom.
         */
        fun avsenderMatcher(faktisk: String, ventet: String): Boolean {
            val a = faktisk.trim()
            val v = ventet.trim()
            if (a.isEmpty() || v.isEmpty()) return false

            val aSiffer = a.filter { it.isDigit() }
            val vSiffer = v.filter { it.isDigit() }
            if (aSiffer.length >= 6 && vSiffer.length >= 6) {
                return aSiffer.takeLast(8) == vSiffer.takeLast(8)
            }

            val aRen = a.replace(" ", "").lowercase()
            val vRen = v.replace(" ", "").lowercase()
            return aRen == vRen || aRen.contains(vRen) || vRen.contains(aRen)
        }

        /** Returnerer HTTP-statuskoden. Kaster ved nettverksfeil. */
        fun send(url: String, token: String, avsender: String, tekst: String): Int {
            val adresse = URL(url)
            val kobling = (adresse.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 15000
                readTimeout = 15000
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                // Nøkkelen sendes både som header og i adressen, slik at det
                // virker uansett hvordan endepunktet er satt opp.
                setRequestProperty("x-sms-token", token)
            }
            val kropp = """{"from":${jsonStreng(avsender)},"text":${jsonStreng(tekst)}}"""
            kobling.outputStream.use { ut: OutputStream ->
                ut.write(kropp.toByteArray(Charsets.UTF_8))
            }
            val kode = kobling.responseCode
            kobling.disconnect()
            return kode
        }

        /** Enkel JSON-escaping — vi har ingen JSON-bibliotek, og trenger ikke et. */
        private fun jsonStreng(s: String): String {
            val b = StringBuilder("\"")
            for (c in s) {
                when (c) {
                    '"' -> b.append("\\\"")
                    '\\' -> b.append("\\\\")
                    '\n' -> b.append("\\n")
                    '\r' -> b.append("\\r")
                    '\t' -> b.append("\\t")
                    else -> if (c < ' ') b.append("\\u%04x".format(c.code)) else b.append(c)
                }
            }
            return b.append("\"").toString()
        }
    }
}

/**
 * Meldinger som ennå ikke er kvittert av tilbudssystemet, lagret på telefonen.
 *
 * Lagringen må overleve at appen blir drept mellom to forsøk — derfor commit()
 * og ikke apply(). To meldinger kan komme samtidig, og hver kringkasting kan få
 * sin egen mottaker-instans, så alt går gjennom én lås. Hver melding får sine
 * egne nøkler; da slipper teksten å bli escapet inn i en felles streng.
 */
object Sendeko {
    /** Køen er en sikkerhetsventil, ikke et arkiv. */
    private const val MAKS = 50
    private const val KO = "ko"
    private const val NESTE_ID = "ko.neste"
    private const val FORSOK = "ko.forsok"

    private val laas = Any()

    /**
     * Egen lås for hele tømmesekvensen hent → send → fjern. [laas] dekker bare
     * én operasjon mot lageret om gangen, og det er ikke nok: mellom forste() og
     * fjern() ligger et nettverkskall som kan ta 15 sekunder, og der rekker en
     * annen tråd å hente og sende den samme meldingen.
     */
    val tommelaas = Any()

    class Melding(val id: String, val fra: String, val tekst: String)

    fun leggTil(context: Context, fra: String, tekst: String) {
        synchronized(laas) {
            val p = prefs(context)
            val id = p.getLong(NESTE_ID, 1L)
            val e = p.edit()
            e.putLong(NESTE_ID, id + 1L)
            e.putString("m.$id.fra", fra)
            e.putString("m.$id.tekst", tekst)

            var ider = idListe(p) + id.toString()
            while (ider.size > MAKS) {
                slettFelter(e, ider.first())
                ider = ider.drop(1)
            }
            e.putString(KO, ider.joinToString(","))
            e.commit()
        }
    }

    fun antall(context: Context): Int = synchronized(laas) { idListe(prefs(context)).size }

    fun forste(context: Context): Melding? = synchronized(laas) {
        val p = prefs(context)
        val id = idListe(p).firstOrNull() ?: return null
        val tekst = p.getString("m.$id.tekst", null)
        if (tekst == null) {
            // Mangler teksten, er raden ubrukelig. Blir den liggende, står køen
            // i stampe på en melding som aldri kan sendes.
            fjern(context, id)
            return null
        }
        Melding(id, p.getString("m.$id.fra", "") ?: "", tekst)
    }

    fun fjern(context: Context, id: String) {
        synchronized(laas) {
            val p = prefs(context)
            val e = p.edit()
            slettFelter(e, id)
            e.putString(KO, idListe(p).filter { it != id }.joinToString(","))
            e.commit()
        }
    }

    /** Antall mislykkede runder på rad. Styrer hvor lenge vi venter til neste. */
    fun okForsok(context: Context): Int = synchronized(laas) {
        val p = prefs(context)
        val n = p.getInt(FORSOK, 0) + 1
        p.edit().putInt(FORSOK, n).commit()
        n
    }

    fun nullstillForsok(context: Context) {
        synchronized(laas) { prefs(context).edit().putInt(FORSOK, 0).commit() }
    }

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences("smsvidere", Context.MODE_PRIVATE)

    private fun idListe(p: SharedPreferences): List<String> =
        (p.getString(KO, "") ?: "").split(",").filter { it.isNotBlank() }

    private fun slettFelter(e: SharedPreferences.Editor, id: String) {
        e.remove("m.$id.fra")
        e.remove("m.$id.tekst")
    }
}
