// Små hjelpere for SQL-tekst.

/**
 * Deler en migrasjonsfil i setninger slik supabase CLI gjør før den kjører og
 * registrerer den: på semikolon utenfor strenger, navn i anførselstegn,
 * dollar-sitater og kommentarer, uten semikolonet og uten tomme setninger.
 * Kommentarer foran en setning blir med i den. Sjekket mot det CLI 2.119.0
 * lagret i schema_migrations for alle 37 filene 7. oktober 2026: likt.
 */
export function delOppSql(sql) {
  const ut = [];
  let start = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const neste = sql[i + 1];
    if (c === "-" && neste === "-") {
      const slutt = sql.indexOf("\n", i);
      i = slutt < 0 ? n : slutt + 1;
    } else if (c === "/" && neste === "*") {
      let dybde = 1;
      i += 2;
      while (i < n && dybde > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          dybde++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          dybde--;
          i += 2;
        } else i++;
      }
    } else if (c === "'" || c === '"') {
      i++;
      while (i < n) {
        if (sql[i] === c && sql[i + 1] === c) i += 2;
        else if (sql[i] === c) {
          i++;
          break;
        } else i++;
      }
    } else if (c === "$") {
      const merke = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (merke && !/[A-Za-z0-9_]/.test(sql[i - 1] || "")) {
        const slutt = sql.indexOf(merke[0], i + merke[0].length);
        i = slutt < 0 ? n : slutt + merke[0].length;
      } else i++;
    } else if (c === ";") {
      const s = sql.slice(start, i).trim();
      if (s) ut.push(s);
      start = i + 1;
      i++;
    } else i++;
  }
  const rest = sql.slice(start).trim();
  if (rest) ut.push(rest);
  return ut;
}

/** En SQL-streng i enkle anførselstegn. Forutsetter standard_conforming_strings = on. */
export function strengLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}
