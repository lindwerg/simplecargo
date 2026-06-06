// PURE presentational A4 КП (commercial proposal) on the РусНерудСтрой letterhead.
// No "use client", no state — renders a KpModel + COMPANY + CONTACT_DEFAULT.
// All colors are FIXED (black on white) so the print output is identical in dark mode.

import { COMPANY, CONTACT_DEFAULT } from "@/lib/config/company";
import type { KpModel } from "@/lib/documents/proposalKp";

const BLUE = "#1F4E79";
const INK = "#111111";
const BORDER = "#444444";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

interface Props {
  model: KpModel;
}

const page: React.CSSProperties = {
  fontFamily: SERIF,
  color: INK,
  padding: "18mm",
  fontSize: 12,
  lineHeight: 1.5,
};

const requisites: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  lineHeight: 1.45,
  textAlign: "right",
};

const blueBar: React.CSSProperties = {
  height: 12,
  background: BLUE,
  marginTop: 10,
};

const cell: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  padding: "6px 8px",
  fontSize: 11.5,
  verticalAlign: "top",
};

const headCell: React.CSSProperties = {
  ...cell,
  fontWeight: 700,
  background: "#F2F5F9",
  textAlign: "left",
};

export function KpDocument({ model }: Props) {
  return (
    <article style={page}>
      {/* Letterhead: logo left + requisites right */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
        <img
          src={COMPANY.logoPath}
          alt={COMPANY.name}
          width={190}
          style={{ width: 190, height: "auto", objectFit: "contain" }}
        />
        <div style={requisites}>
          <div>{COMPANY.name}</div>
          <div>{`ИНН ${COMPANY.inn} КПП ${COMPANY.kpp} ОГРН ${COMPANY.ogrn}`}</div>
          <div>{`ОКПО ${COMPANY.okpo} ОКВЭД ${COMPANY.okved}`}</div>
          <div>{COMPANY.addressLine}</div>
          <div>{`E-mail: ${COMPANY.email}  телефон: ${COMPANY.phone}`}</div>
        </div>
      </header>

      <div style={blueBar} />

      <div style={{ height: 28 }} />

      {/* Исх.№ … + addressee */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
        <div style={{ fontSize: 12 }}>{`Исх.№ ${model.issNumber} от ${model.dateLabel}`}</div>
        <div style={{ fontWeight: 700, textAlign: "right", lineHeight: 1.45 }}>
          <div>Коммерческому директору</div>
          <div>{model.clientName}</div>
        </div>
      </div>

      <h1 style={{ textAlign: "center", fontWeight: 700, fontSize: 15, margin: "28px 0 18px" }}>
        {model.greeting}
      </h1>

      {model.introLines.map((line, i) => (
        <p key={i} style={{ textAlign: "justify", margin: "0 0 10px" }}>
          {line}
        </p>
      ))}

      {/* Directions table */}
      <table style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0 12px" }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: 36, textAlign: "center" }}>№</th>
            <th style={headCell}>Направление</th>
            <th style={{ ...headCell, width: 130 }}>Вид вагона</th>
            <th style={{ ...headCell, width: 80, textAlign: "center" }}>Кол-во</th>
            <th style={{ ...headCell, width: 130 }}>Ставка</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.idx}>
              <td style={{ ...cell, textAlign: "center" }}>{row.idx}</td>
              <td style={cell}>{row.route}</td>
              <td style={cell}>{row.wagonType}</td>
              <td style={{ ...cell, textAlign: "center" }}>{row.count}</td>
              <td style={cell}>{row.rateText}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ margin: "0 0 14px", fontStyle: "italic" }}>{model.vatNote}</p>

      {model.closingLines.map((line, i) => (
        <p key={i} style={{ textAlign: "justify", margin: "0 0 10px" }}>
          {line}
        </p>
      ))}

      {/* Signature area — matches the original letterhead: one line
          «{title} {shortName} ____________ {directorName}» with the round stamp +
          signature PNG at its ORIGINAL proportions (810×324) overlapping the line. */}
      <div style={{ marginTop: 34 }}>
        <div>С уважением,</div>
        <div
          style={{
            position: "relative",
            marginTop: 16,
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
            minHeight: 150,
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>{`${COMPANY.directorTitle} ${COMPANY.shortName}`}</span>
          <span
            style={{
              position: "relative",
              flex: "1 1 auto",
              minWidth: 220,
              alignSelf: "flex-end",
              borderBottom: `1px solid ${INK}`,
              height: 1,
            }}
          >
            <img
              src={COMPANY.stampSignaturePath}
              alt=""
              width={360}
              style={{
                position: "absolute",
                left: -28,
                bottom: -58,
                width: 360,
                height: "auto",
                objectFit: "contain",
                pointerEvents: "none",
              }}
            />
          </span>
          <span style={{ whiteSpace: "nowrap" }}>{COMPANY.directorName}</span>
        </div>
      </div>

      {/* Исполнитель block bottom-left */}
      <footer style={{ marginTop: 40, fontSize: 11, color: "#333333", lineHeight: 1.4 }}>
        <div>{`Исп. ${CONTACT_DEFAULT.name}`}</div>
        <div>{`Тел. ${CONTACT_DEFAULT.phone}`}</div>
        <div>{CONTACT_DEFAULT.email}</div>
      </footer>
    </article>
  );
}
