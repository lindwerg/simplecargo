// Issuing company requisites (РНС letterhead) — single source of truth for КП / letters.
// Assets (logo, stamp+signature) live in public/kp/.

export interface CompanyInfo {
  name: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  okpo: string;
  okved: string;
  addressLine: string;
  email: string;
  phone: string;
  directorName: string;
  directorTitle: string;
  vatRatePct: number;
  logoPath: string;
  stampSignaturePath: string;
}

export interface ContactInfo {
  name: string;
  phone: string;
  email: string;
}

export const COMPANY: CompanyInfo = {
  name: "ООО «РУСНЕРУДСТРОЙ»",
  shortName: "ООО «РНС»",
  inn: "6671325150",
  kpp: "667101001",
  ogrn: "1256600013207",
  okpo: "71142175",
  okved: "52.29",
  addressLine:
    "Россия, 620014, Свердловская обл., г. Екатеринбург, ул. Радищева, стр.6А, офис 1202",
  email: "info@rusnerudstroy.ru",
  phone: "+7-929-212-07-70",
  directorName: "Мишанихин Олег Геннадьевич",
  directorTitle: "Генеральный директор",
  vatRatePct: 22,
  logoPath: "/kp/logo.png",
  stampSignaturePath: "/kp/stamp-signature.png",
};

// Default исполнитель/contact shown on outgoing documents.
export const CONTACT_DEFAULT: ContactInfo = {
  name: "Киян Анна",
  phone: "8-906-807-66-17",
  email: "info@rusnerudstroy.ru",
};
