"use client";

import type { ReactNode } from "react";
import {
  recordValue,
  stringArrayValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/saveursetvieofficiel";
const DEFAULT_FACEBOOK_URL = "https://www.facebook.com/SaveursEtVie";

const DEFAULT_COMPANY_LINES = [
  "Saveurs et Vie - SAS au capital de 106 477, 50 €- N° Siret : 43467677100091",
  "Rue de la Soie Bât. 285 Cellule C8 C9, 94310 ORLY",
  "Cet email a été envoyé à EMAIL",
];

const DEFAULT_GDPR =
  "Vous disposez d’un droit d’accès, de rectification, d’effacement sur vos données, ainsi qu’un droit de limitation et d’opposition du traitement. Vous avez la possibilité d’exercer ces droits sur simple demande par courrier électronique à l’adresse suivante : dpo@saveursetvie.fr ou en cliquant sur le lien de désabonnement pour ne plus recevoir de mails de notre part. En cas de difficultés liées à la gestion de vos données, vous avez la possibilité de saisir la CNIL (www.cnil.fr).";

type IconLinkProps = {
  href: string;
  label: string;
  children: ReactNode;
};

function IconLink({ href, label, children }: IconLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fcbf00] text-white transition-opacity hover:opacity-90"
    >
      {children}
    </a>
  );
}

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M14.5 8.5V6.8c0-.8.5-1 1-1h1.3V3h-2.2C12.2 3 11 4.5 11 6.7v1.8H9v3h2v9h3.5v-9h2.4l.4-3h-2.8z" />
    </svg>
  );
}

function replaceRecipientEmail(line: string, recipientEmailLabel: string): string {
  if (!line) return line;
  if (line.includes("EMAIL")) {
    return line.replace(/EMAIL/g, recipientEmailLabel);
  }
  if (/cet email a été envoyé à$/i.test(line.trim())) {
    return `${line} ${recipientEmailLabel}`.trim();
  }
  return line;
}

function parseSocials(layout: Record<string, unknown>, data: Record<string, unknown>) {
  const layoutSocials = recordValue(layout.socials) ?? {};
  const dataSocials = recordValue(data.socials) ?? {};
  const showValue = dataSocials.show ?? layoutSocials.show;
  const show = typeof showValue === "boolean" ? showValue : true;
  const instagramUrl =
    stringValue(dataSocials.instagramUrl) ||
    stringValue(layoutSocials.instagramUrl) ||
    DEFAULT_INSTAGRAM_URL;
  const facebookUrl =
    stringValue(dataSocials.facebookUrl) ||
    stringValue(layoutSocials.facebookUrl) ||
    DEFAULT_FACEBOOK_URL;
  return { show, instagramUrl, facebookUrl };
}

export function SvFooterBeigeV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec) ?? {};
  const dataRecord = recordValue(data) ?? {};
  const socials = parseSocials(layout, dataRecord);

  const recipientEmailLabel =
    stringValue(dataRecord.recipientEmailLabel) ||
    stringValue(layout.recipientEmailLabel) ||
    "EMAIL";

  const companyLinesRaw =
    stringArrayValue(dataRecord.companyLines).length > 0
      ? stringArrayValue(dataRecord.companyLines)
      : stringArrayValue(layout.companyLines).length > 0
        ? stringArrayValue(layout.companyLines)
        : DEFAULT_COMPANY_LINES;
  const companyLines = companyLinesRaw.map((line) =>
    replaceRecipientEmail(line, recipientEmailLabel)
  );

  const gdprParagraph =
    stringValue(dataRecord.gdprParagraph) ||
    stringValue(layout.gdprParagraph) ||
    DEFAULT_GDPR;

  const dataUnsubscribe = recordValue(dataRecord.unsubscribe) ?? {};
  const layoutUnsubscribe = recordValue(layout.unsubscribe) ?? {};
  const unsubscribeLabel =
    stringValue(dataUnsubscribe.label) ||
    stringValue(layoutUnsubscribe.label) ||
    "Se désinscrire";
  const unsubscribeUrl =
    stringValue(dataUnsubscribe.url) ||
    stringValue(layoutUnsubscribe.url);

  return (
    <section
      className="w-full px-[20px] py-[20px] text-center text-[10px] leading-[1.5] text-black"
      style={{
        fontFamily: "Tahoma, Arial, sans-serif",
        borderRadius: brandTheme.radius,
        backgroundColor: "#faf9f0",
      }}
    >
      {socials.show ? (
        <div className="flex items-center justify-center gap-2">
          <IconLink href={socials.instagramUrl} label="Instagram">
            <InstagramIcon />
          </IconLink>
          <IconLink href={socials.facebookUrl} label="Facebook">
            <FacebookIcon />
          </IconLink>
        </div>
      ) : null}

      <div className={socials.show ? "mt-3" : ""}>
        {companyLines.length > 0 ? (
          companyLines.map((line, index) => (
            <p key={`${line}-${index}`} className="m-0">
              {line}
            </p>
          ))
        ) : (
          <p className="m-0 text-black/60">Informations légales</p>
        )}
      </div>

      <div className="mx-auto mt-3 max-w-[560px]">
        <p className="m-0">
          {gdprParagraph || <span className="text-black/60">Texte RGPD</span>}
        </p>
      </div>

      <div className="mt-4">
        {unsubscribeUrl ? (
          <a
            href={unsubscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-black underline"
          >
            {unsubscribeLabel}
          </a>
        ) : (
          <span className="text-black underline">{unsubscribeLabel}</span>
        )}
      </div>
    </section>
  );
}
