// Telefonfelt som rydder opp etter seg selv.
//
// Brukeren skal kunne skrive nummeret akkurat som han er vant til — med
// landskode eller uten, med mellomrom eller uten, med bindestreker — og få det
// samme resultatet hver gang. Ryddingen skjer når feltet forlates, ikke mens
// det skrives i: flyttes markøren rundt mens noen taster, blir det umulig å
// rette en feil midt i nummeret.

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { normaliserTelefon, telefonAdvarsel } from "@/lib/telefon";

interface Props {
  value: string;
  onChange: (verdi: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function TelefonInput({
  value, onChange, id, placeholder = "912 34 567", className, disabled, readOnly,
}: Props) {
  // Advarselen vises først etter at feltet er forlatt. Ellers står det «bare 3
  // siffer» mens man er i gang med å skrive det tredje.
  const [rørt, setRørt] = useState(false);
  const advarsel = rørt ? telefonAdvarsel(value) : null;

  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="tel"
        // Gir talltastatur på mobil i stedet for det vanlige — merkbart på et
        // felt der det bare skal siffer inn.
        inputMode="tel"
        autoComplete="tel"
        value={value}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setRørt(true);
          if (readOnly || disabled) return;
          const t = normaliserTelefon(value);
          // Bare skriv tilbake når det faktisk ble noe annet, ellers får
          // skjemaet en «endring» hver gang feltet berøres.
          if (!t.tomt && t.visning !== value) onChange(t.visning);
          if (t.tomt && value !== "") onChange("");
        }}
      />
      {advarsel && (
        <p className="text-xs text-amber-700 dark:text-amber-500">{advarsel}</p>
      )}
    </div>
  );
}
