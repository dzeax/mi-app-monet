'use server';

import { escapeXml, decodeXmlEntities } from '@/lib/doctorsender/utils';
import { writeDoctorSenderDebugFile } from '@/lib/doctorsender/debug';

type SoapPrimitive = string | number | boolean | null | undefined;
type SoapValue = SoapPrimitive | SoapPrimitive[] | Record<string, SoapPrimitive>;

function serializePrimitive(value: SoapPrimitive) {
  if (value === null || value === undefined) {
    return '<item xsi:nil="true" />';
  }

  if (typeof value === 'boolean') {
    return `<item xsi:type="xsd:boolean">${value ? 'true' : 'false'}</item>`;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `<item xsi:type="xsd:int">${value}</item>`;
    }
    return `<item xsi:type="xsd:double">${value}</item>`;
  }

  return `<item xsi:type="xsd:string">${escapeXml(String(value))}</item>`;
}

function serializeArray(values: SoapPrimitive[]) {
  const allObjects = values.every((value) => value && typeof value === 'object' && !Array.isArray(value));

  if (allObjects) {
    const items = (values as Record<string, SoapPrimitive>[])
      .map((obj) => {
        const entries = Object.entries(obj ?? {})
          .map(([key, val]) => {
            if (val === null || val === undefined) return `<${key} xsi:nil="true" />`;
            if (typeof val === 'boolean') return `<${key} xsi:type="xsd:boolean">${val ? 'true' : 'false'}</${key}>`;
            if (typeof val === 'number' && Number.isInteger(val)) return `<${key} xsi:type="xsd:int">${val}</${key}>`;
            return `<${key} xsi:type="xsd:string">${escapeXml(String(val))}</${key}>`;
          })
          .join('');
        return `<item xsi:type="SOAP-ENC:Struct">${entries}</item>`;
      })
      .join('');
    return `<item SOAP-ENC:arrayType="SOAP-ENC:Struct[${values.length}]" xsi:type="SOAP-ENC:Array">${items}</item>`;
  }

  const type = values.every((value) => typeof value === 'number' && Number.isInteger(value))
    ? 'xsd:int'
    : 'xsd:string';
  const items = values
    .map((value) => {
      if (value === null || value === undefined) return '<item xsi:nil="true" />';
      if (typeof value === 'boolean') {
        return `<item xsi:type="xsd:boolean">${value ? 'true' : 'false'}</item>`;
      }
      if (typeof value === 'number' && Number.isInteger(value)) {
        return `<item xsi:type="xsd:int">${value}</item>`;
      }
      return `<item xsi:type="xsd:string">${escapeXml(String(value))}</item>`;
    })
    .join('');
  return `<item SOAP-ENC:arrayType="${type}[${values.length}]" xsi:type="SOAP-ENC:Array">${items}</item>`;
}

function serializeValue(value: SoapValue): string {
  if (Array.isArray(value)) {
    return serializeArray(value);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, val]) => {
        if (val === null || val === undefined) {
          return `<${key} xsi:nil="true" />`;
        }
        if (typeof val === 'boolean') {
          return `<${key} xsi:type="xsd:boolean">${val ? 'true' : 'false'}</${key}>`;
        }
        if (typeof val === 'number' && Number.isInteger(val)) {
          return `<${key} xsi:type="xsd:int">${val}</${key}>`;
        }
        return `<${key} xsi:type="xsd:string">${escapeXml(String(val))}</${key}>`;
      })
      .join('');
    return `<item xsi:type="SOAP-ENC:Struct">${entries}</item>`;
  }

  return serializePrimitive(value);
}

function buildEnvelope(method: string, data: SoapValue[], auth: { user: string; token: string }) {
  const serializedData =
    data.length === 0
      ? '<data xsi:nil="true"/>'
      : `<data SOAP-ENC:arrayType="xsd:anyType[${data.length}]" xsi:type="SOAP-ENC:Array">${data
          .map((value) => serializeValue(value))
          .join('')}</data>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns1="ns1"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"
  SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <SOAP-ENV:Header>
    <ns1:app_auth>
      <item>
        <key>user</key>
        <value>${escapeXml(auth.user)}</value>
      </item>
      <item>
        <key>token</key>
        <value>${escapeXml(auth.token)}</value>
      </item>
    </ns1:app_auth>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <ns1:webservice>
      <method xsi:type="xsd:string">${escapeXml(method)}</method>
      ${serializedData}
      <construct_params xsi:nil="true"/>
      <execution_mode xsi:nil="true"/>
    </ns1:webservice>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

function parseSoapResponse(xml: string, method: string) {
  const mapMatch = xml.match(/<webserviceReturn[^>]*>([\s\S]*?)<\/webserviceReturn>/);
  if (mapMatch) {
    const body = mapMatch[1];
    const result: Record<string, unknown> = {};
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(body)) !== null) {
      const itemXml = itemMatch[1];
      const keyMatch = itemXml.match(/<key[^>]*>([\s\S]*?)<\/key>/);
      const valueMatch = itemXml.match(/<value[^>]*>([\s\S]*?)<\/value>/);
      if (!keyMatch) continue;
      const key = decodeXmlEntities(keyMatch[1].trim());
      if (!valueMatch) {
        result[key] = null;
        continue;
      }
      const rawValue = valueMatch[1].trim();
      if (!rawValue || /^<\/?value/.test(rawValue)) {
        result[key] = null;
        continue;
      }
      if (rawValue.includes('<item>')) {
        result[key] = decodeXmlEntities(rawValue);
        continue;
      }
      const decodedValue = decodeXmlEntities(rawValue);
      const numeric = Number(decodedValue);
      result[key] = Number.isFinite(numeric) && decodedValue === String(numeric) ? numeric : decodedValue;
    }
    return result;
  }

  const match = xml.match(/<return[^>]*>([\s\S]*?)<\/return>/);
  if (!match) {
    // Some responses return <webserviceReturn xsi:nil="true"/> to mean "OK but no body"
    const nilReturn = xml.match(/<webserviceReturn[^>]*xsi:nil="true"[^>]*\/>/);
    if (nilReturn) {
      return { data: null };
    }
    console.error('DoctorSender SOAP response missing <return>', {
      method,
      preview: xml.slice(0, 500),
    });
    throw new Error('Invalid SOAP response.');
  }
  const decoded = decodeXmlEntities(match[1].trim());
  try {
    return JSON.parse(decoded);
  } catch (parseError) {
    console.error('DoctorSender SOAP returned non-JSON payload', {
      method,
      payloadPreview: decoded.slice(0, 500),
      parseError,
    });
    throw new Error(decoded || 'Unable to parse SOAP response.');
  }
}

export async function soapCall(
  method: string,
  data: SoapValue[],
  credentials?: { user: string; token: string }
) {
  const user = credentials?.user ?? process.env.DOCTORSENDER_SOAP_USER;
  const token = credentials?.token ?? process.env.DOCTORSENDER_SOAP_TOKEN;
  if (!user || !token) {
    throw new Error('DoctorSender credentials are not configured.');
  }
  const url = process.env.DOCTORSENDER_SOAP_URL ?? 'https://soapwebservice.doctorsender.com/soapserver.php';
  const body = buildEnvelope(method, data, { user, token });
  const debugToken = `${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeDoctorSenderDebugFile(`soap-${debugToken}-request.xml`, body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
    },
    body,
  });

  const responseText = await response.text();
  await writeDoctorSenderDebugFile(`soap-${debugToken}-response.xml`, responseText);

  if (!response.ok) {
    throw new Error(`DoctorSender error: ${response.status} ${response.statusText}`);
  }

  const payload = parseSoapResponse(responseText, method);

  const hasError =
    payload?.error === true ||
    payload?.error === 'true' ||
    payload?.response_code === 'ERROR' ||
    payload?.response_code === 'error';

  if (hasError) {
    console.error('DoctorSender SOAP returned error', {
      method,
      payload,
    });
    throw new Error(payload?.msg || JSON.stringify(payload) || 'DoctorSender returned an error.');
  }

  return payload?.data ?? payload;
}
