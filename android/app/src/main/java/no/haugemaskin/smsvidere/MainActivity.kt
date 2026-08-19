package no.haugemaskin.smsvidere

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/** Enkel innstillingsside. Lages i kode, så appen slipper XML og temaer. */
class MainActivity : AppCompatActivity() {

    private lateinit var innst: Innstillinger
    private lateinit var urlFelt: EditText
    private lateinit var tokenFelt: EditText
    private lateinit var avsenderFelt: EditText
    private lateinit var filterFelt: EditText
    private lateinit var status: TextView

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        innst = Innstillinger(this)

        val rot = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
        }

        rot.addView(TextView(this).apply {
            text = "SMS-videresending"
            textSize = 22f
            setPadding(0, 0, 0, 8)
        })
        rot.addView(TextView(this).apply {
            text = "Sender anbudsprotokoller videre til tilbudssystemet. " +
                "Meldinger som ikke inneholder filterordet blir liggende på telefonen."
            textSize = 13f
            setPadding(0, 0, 0, 32)
        })

        urlFelt = felt(rot, "Adresse", innst.url, InputType.TYPE_TEXT_VARIATION_URI)
        tokenFelt = felt(rot, "Nøkkel", innst.token, InputType.TYPE_CLASS_TEXT)
        // Vanlig tekstfelt, ikke telefonfelt: avsenderen er ofte et navn
        // («HaugeMaskin»), og et telefonfelt gir talltastatur.
        avsenderFelt = felt(rot, "Send bare fra denne avsenderen", innst.avsender, InputType.TYPE_CLASS_TEXT)
        filterFelt = felt(rot, "…og som inneholder (valgfritt)", innst.filter, InputType.TYPE_CLASS_TEXT)

        rot.addView(Button(this).apply {
            text = "Lagre"
            setOnClickListener { lagre() }
        })

        rot.addView(Button(this).apply {
            text = "Send en testmelding"
            setOnClickListener { test() }
        })

        status = TextView(this).apply {
            textSize = 13f
            setPadding(0, 32, 0, 0)
            gravity = Gravity.START
        }
        rot.addView(status)

        setContentView(ScrollView(this).apply { addView(rot) })

        // Uten denne tillatelsen får mottakeren aldri meldingene
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECEIVE_SMS), 1)
        }
        visStatus()
    }

    override fun onResume() {
        super.onResume()
        visStatus()
    }

    private fun felt(rot: LinearLayout, etikett: String, verdi: String, type: Int): EditText {
        rot.addView(TextView(this).apply {
            text = etikett
            textSize = 13f
            setPadding(0, 24, 0, 4)
        })
        val e = EditText(this).apply {
            setText(verdi)
            inputType = type
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        }
        rot.addView(e)
        return e
    }

    private fun lagre() {
        innst.url = urlFelt.text.toString().trim()
        innst.token = tokenFelt.text.toString().trim()
        innst.avsender = avsenderFelt.text.toString().trim()
        innst.filter = filterFelt.text.toString().trim()
        Toast.makeText(this, "Lagret", Toast.LENGTH_SHORT).show()
        visStatus()
    }

    private fun test() {
        lagre()
        if (!innst.erKlar()) {
            Toast.makeText(this, "Fyll inn adresse og nøkkel først", Toast.LENGTH_LONG).show()
            return
        }
        status.text = "Sender…"
        Thread {
            val melding = try {
                val kode = SmsReceiver.send(
                    innst.url, innst.token, "TEST",
                    "Anbudsprotokoll Testoppdrag\nFirma A 1.000.000\nFirma B 1.200.000",
                )
                if (kode in 200..299) "Testmelding sendt. Se under Anbud i systemet."
                else "Endepunktet svarte HTTP $kode"
            } catch (e: Exception) {
                "Klarte ikke å sende: ${e.message}"
            }
            Logg.skriv(this, melding)
            runOnUiThread { visStatus() }
        }.start()
    }

    private fun visStatus() {
        val tillatelse = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED
        status.text = buildString {
            append(if (tillatelse) "✓ Har tilgang til SMS\n" else "✗ Mangler SMS-tilgang — appen kan ikke lese meldinger\n")
            append(if (innst.erKlar()) "✓ Adresse og nøkkel er satt\n" else "✗ Adresse eller nøkkel mangler\n")
            append(
                if (innst.avsender.isBlank()) "• Alle avsendere slipper gjennom\n"
                else "✓ Bare fra " + innst.avsender + "\n"
            )
            append("\nSiste hendelser:\n")
            append(Logg.les(this@MainActivity).ifBlank { "(ingen ennå)" })
        }
    }
}

/** Innstillingene, lagret lokalt på telefonen. */
class Innstillinger(context: Context) {
    private val p = context.getSharedPreferences("smsvidere", Context.MODE_PRIVATE)

    var url: String
        get() = p.getString("url", "") ?: ""
        set(v) = p.edit().putString("url", v).apply()

    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v).apply()

    /**
     * Navnet eller nummeret protokollene alltid kommer fra. Tomt = alle.
     * Standarden er avsenderen som faktisk brukes i dag, så feltet er riktig
     * utfylt fra første gang appen åpnes.
     */
    var avsender: String
        get() = p.getString("avsender", "HaugeMaskin") ?: "HaugeMaskin"
        set(v) = p.edit().putString("avsender", v).apply()

    var filter: String
        get() = p.getString("filter", "Anbudsprotokoll") ?: "Anbudsprotokoll"
        set(v) = p.edit().putString("filter", v).apply()

    fun erKlar() = url.isNotBlank() && token.isNotBlank()
}

/** Kort historikk, så du kan se om noe faktisk ble sendt. */
object Logg {
    private const val MAKS = 10

    fun skriv(context: Context, melding: String) {
        val p = context.getSharedPreferences("smsvidere", Context.MODE_PRIVATE)
        val tid = android.text.format.DateFormat.format("dd.MM HH:mm", System.currentTimeMillis())
        val linjer = (listOf("$tid  $melding") + les(context).lines()).filter { it.isNotBlank() }.take(MAKS)
        p.edit().putString("logg", linjer.joinToString("\n")).apply()
    }

    fun les(context: Context): String =
        context.getSharedPreferences("smsvidere", Context.MODE_PRIVATE).getString("logg", "") ?: ""
}
