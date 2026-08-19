package no.haugemaskin.smsvidere

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val deler = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (deler.isEmpty()) return

        val avsender = deler[0].originatingAddress ?: ""
        val tekst = deler.joinToString("") { it.messageBody ?: "" }

        val innst = Innstillinger(context)
        if (!innst.erKlar()) return

        // Avsenderfilteret er det treffsikre: protokollene kommer alltid fra
        // samme avsender. Står feltet tomt, slipper alle avsendere gjennom.
        val ventetAvsender = innst.avsender.trim()
        if (ventetAvsender.isNotEmpty() && !avsenderMatcher(avsender, ventetAvsender)) return

        // Ordfilteret er et ekstra sikkerhetsnett. Står det tomt, sendes alt fra
        // avsenderen over.
        val filter = innst.filter.trim()
        if (filter.isNotEmpty() && !tekst.contains(filter, ignoreCase = true)) return

        // Nettverk kan ikke gjøres på hovedtråden, og onReceive er ferdig med én
        // gang. goAsync() holder prosessen i live til sendingen er gjort.
        val pendingResult = goAsync()
        Thread {
            try {
                val svar = send(innst.url, innst.token, avsender, tekst)
                Log.i(TAG, "Sendte ${tekst.length} tegn, svar $svar")
                Logg.skriv(context, if (svar in 200..299) "Sendt ($svar)" else "Feil: HTTP $svar")
            } catch (e: Exception) {
                Log.e(TAG, "Klarte ikke å sende", e)
                Logg.skriv(context, "Feil: ${e.message}")
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    companion object {
        private const val TAG = "SmsVidere"

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
