'use server';

import { escapeXml, decodeXmlEntities } from '@/lib/doctorsender/utils';
import { writeDoctorSenderDebugFile } from '@/lib/doctorsender/debug';

type SoapPrimitive = string | number | boolean | null | undefined;
type SoapObject = Record<string, SoapPrimitive>;
type SoapArrayItem = SoapPrimitive | SoapObject;
type SoapValue = SoapPrimitive | SoapArrayItem[] | SoapObject;
type SerializeOptions = {
  objectArrayAsMap?: boolean;
};

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

function serializeMapEntryValue(value: SoapPrimitive) {
  if (value === null || value === undefined) {
    return '<value xsi:nil="true" />';
  }

  if (typeof value === 'boolean') {
    return `<value xsi:type="xsd:boolean">${value ? 'true' : 'false'}</value>`;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `<value xsi:type="xsd:int">${value}</value>`;
    }
    return `<value xsi:type="xsd:double">${value}</value>`;
  }

  return `<value xsi:type="xsd:string">${escapeXml(String(value))}</value>`;
}

function serializeObjectAsMap(obj: SoapObject) {
  const entries = Object.entries(obj ?? {})
    .map(
      ([key, val]) =>
        `<item><key xsi:type="xsd:string">${escapeXml(key)}</key>${serializeMapEntryValue(val)}</item>`,
    )
    .join('');

  return `<item xsi:type="ns2:Map">${entries}</item>`;
}

function serializeArray(values: SoapArrayItem[], options: SerializeOptions = {}) {
  const allObjects = values.every(
    (value): value is SoapObject => value !== null && typeof value === 'object' && !Array.isArray(value),
  );

  if (allObjects) {
    if (options.objectArrayAsMap) {
      const items = values.map((obj) => serializeObjectAsMap(obj)).join('');
      return `<item SOAP-ENC:arrayType="ns2:Map[${values.length}]" xsi:type="SOAP-ENC:Array">${items}</item>`;
    }

    const items = values
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

function serializeValue(value: SoapValue, options: SerializeOptions = {}): string {
  if (Array.isArray(value)) {
    return serializeArray(value, options);
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
  const serializeOptions: SerializeOptions = {
    objectArrayAsMap: method === 'dsCampaignSendEmailsTest',
  };

  const serializedData =
    data.length === 0
      ? '<data xsi:nil="true"/>'
      : `<data SOAP-ENC:arrayType="xsd:anyType[${data.length}]" xsi:type="SOAP-ENC:Array">${data
          .map((value) => serializeValue(value, serializeOptions))
          .join('')}</data>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns1="ns1"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"
  xmlns:ns2="http://xml.apache.org/xml-soap"
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

function extractTopLevelItemBlocks(xml: string): string[] {
  const blocks: string[] = [];
  const openTag = /<item\b[^>]*>/gi;
  const closeTag = /<\/item>/gi;

  let cursor = 0;
  let depth = 0;
  let blockStart = -1;

  while (cursor < xml.length) {
    openTag.lastIndex = cursor;
    closeTag.lastIndex = cursor;
    const nextOpen = openTag.exec(xml);
    const nextClose = closeTag.exec(xml);

    if (!nextOpen && !nextClose) break;

    if (nextOpen && (!nextClose || nextOpen.index < nextClose.index)) {
      if (depth === 0) blockStart = nextOpen.index;
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }

    if (nextClose) {
      if (depth > 0) {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0 && blockStart >= 0) {
          blocks.push(xml.slice(blockStart, cursor));
          blockStart = -1;
        }
      } else {
        cursor = nextClose.index + nextClose[0].length;
      }
    }
  }

  return blocks;
}

function parseScalarValue(rawValue: string): string | number | boolean | null {
  const decodedValue = decodeXmlEntities(rawValue.trim());
  if (!decodedValue) return null;
  if (decodedValue === 'true') return true;
  if (decodedValue === 'false') return false;
  const numeric = Number(decodedValue);
  if (Number.isFinite(numeric) && decodedValue === String(numeric)) {
    return numeric;
  }
  return decodedValue;
}

function parseSoapMapBody(body: string, depth = 0): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (depth > 6) return result;

  const topLevelItems = extractTopLevelItemBlocks(body);
  for (const itemXml of topLevelItems) {
    const keyMatch = itemXml.match(/<key[^>]*>([\s\S]*?)<\/key>/i);
    if (!keyMatch) continue;
    const key = decodeXmlEntities(keyMatch[1].trim());

    // Only consider the *top-level* <value> for this item. Nested xsi:nil values inside maps/arrays
    // must not null-out the entire item payload.
    const keyEndIndex = (keyMatch.index ?? 0) + keyMatch[0].length;
    const afterKey = itemXml.slice(keyEndIndex);
    const valueTagMatch = afterKey.match(/<value\b[^>]*>/i);
    if (valueTagMatch && /xsi:nil="true"/i.test(valueTagMatch[0])) {
      result[key] = null;
      continue;
    }

    const valueMatch = afterKey.match(/<value[^>]*>([\s\S]*)<\/value>/i);
    if (!valueMatch) {
      result[key] = null;
      continue;
    }

    const rawValue = valueMatch[1].trim();
    if (!rawValue) {
      result[key] = null;
      continue;
    }

    result[key] = parseSoapValue(rawValue, depth + 1);
  }

  const nested = result.msg;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const [nestedKey, nestedValue] of Object.entries(nested)) {
      if (!(nestedKey in result)) {
        result[nestedKey] = nestedValue;
      }
    }
  }

  return result;
}

function parseSoapArrayBody(body: string, depth = 0): unknown[] {
  if (depth > 6) return [];

  const result: unknown[] = [];
  const topLevelItems = extractTopLevelItemBlocks(body);
  for (const itemXml of topLevelItems) {
    const nilItem = itemXml.match(/<item[^>]*xsi:nil="true"[^>]*\/>/i);
    if (nilItem) {
      result.push(null);
      continue;
    }

    const contentMatch = itemXml.match(/<item[^>]*>([\s\S]*)<\/item>/i);
    if (!contentMatch) {
      result.push(null);
      continue;
    }

    const rawValue = contentMatch[1].trim();
    result.push(parseSoapValue(rawValue, depth + 1));
  }
  return result;
}

function parseSoapValue(rawValue: string, depth = 0): unknown {
  if (depth > 6) return parseScalarValue(rawValue);

  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (/<item\b/i.test(trimmed)) {
    const looksLikeMap = /<key\b/i.test(trimmed) && /<value\b/i.test(trimmed);
    if (looksLikeMap) return parseSoapMapBody(trimmed, depth + 1);
    return parseSoapArrayBody(trimmed, depth + 1);
  }

  return parseScalarValue(trimmed);
}

function parseSoapResponse(xml: string, method: string) {
  const mapMatch = xml.match(/<webserviceReturn[^>]*>([\s\S]*?)<\/webserviceReturn>/);
  if (mapMatch) {
    const body = mapMatch[1];
    return parseSoapMapBody(body);
  }

  const match = xml.match(/<return[^>]*>([\s\S]*?)<\/return>/);
  if (!match) {
    // Some responses return <webserviceReturn xsi:nil="true"/> to mean "OK but no body".
    // Normalize this to null so callers can branch on a real empty result.
    const nilReturn = xml.match(/<webserviceReturn[^>]*xsi:nil="true"[^>]*\/>/);
    if (nilReturn) {
      return null;
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

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as Record<string, unknown>).data;
  }

  return payload;
}
