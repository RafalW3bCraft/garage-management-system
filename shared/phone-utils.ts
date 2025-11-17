

export const TRUNK_PREFIX_MAP: { [countryCode: string]: { prefix: string; name: string } } = {
  '44': { prefix: '0', name: 'UK' },
  '61': { prefix: '0', name: 'Australia' },
  '65': { prefix: '0', name: 'Singapore' },
  '33': { prefix: '0', name: 'France' },
  '49': { prefix: '0', name: 'Germany' },
  '39': { prefix: '0', name: 'Italy' },
  '34': { prefix: '0', name: 'Spain' },
  '81': { prefix: '0', name: 'Japan' },
  '82': { prefix: '0', name: 'South Korea' },
  '86': { prefix: '0', name: 'China' },
  '60': { prefix: '0', name: 'Malaysia' },
  '66': { prefix: '0', name: 'Thailand' },
  '971': { prefix: '0', name: 'UAE' },
  '966': { prefix: '0', name: 'Saudi Arabia' },
  '91': { prefix: '0', name: 'India' },
  '92': { prefix: '0', name: 'Pakistan' },
  '94': { prefix: '0', name: 'Sri Lanka' },
  '90': { prefix: '0', name: 'Turkey' },
  '30': { prefix: '0', name: 'Greece' },
  '31': { prefix: '0', name: 'Netherlands' },
  '32': { prefix: '0', name: 'Belgium' },
  '43': { prefix: '0', name: 'Austria' },
  '47': { prefix: '0', name: 'Norway' },
  '48': { prefix: '0', name: 'Poland' },
  '51': { prefix: '0', name: 'Peru' },
  '52': { prefix: '0', name: 'Mexico' },
  '54': { prefix: '0', name: 'Argentina' },
  '55': { prefix: '0', name: 'Brazil' },
};

export function normalizePhone(phone: string, countryCode: string): string {
  let cleanPhone = phone.replace(/\D/g, '');
  const cleanCountryCode = countryCode.replace(/\D/g, '');
  
  const trunkInfo = TRUNK_PREFIX_MAP[cleanCountryCode];
  if (trunkInfo && cleanPhone.startsWith(trunkInfo.prefix)) {
    cleanPhone = cleanPhone.substring(trunkInfo.prefix.length);
  }
  
  return cleanPhone;
}

/**
 * Format phone number to E.164 international format
 * 
 * E.164 is the international telephone numbering standard: +[country code][national number]
 * - No spaces, dashes, or other formatting
 * - Starts with '+'
 * - Total length: 8-15 digits
 * 
 * @param phone - Phone number (will be normalized)
 * @param countryCode - Country code (with or without '+')
 * @returns E.164 formatted phone number
 * @throws Error if validation fails
 * 
 * @example
 * formatE164('09876543210', '+91')
 * formatE164('044 1234 5678', '+44')
 */
export function formatE164(phone: string, countryCode: string): string {
  if (!phone || !countryCode) {
    throw new Error('Phone number and country code are required');
  }

  const cleanCountryCode = countryCode.replace(/\D/g, '');
  
  if (!cleanCountryCode || cleanCountryCode.length === 0) {
    throw new Error('Invalid country code');
  }
  
  const normalizedPhone = normalizePhone(phone, countryCode);
  
  if (!normalizedPhone || normalizedPhone.length < 6 || normalizedPhone.length > 14) {
    throw new Error('Invalid phone number length (must be 6-14 digits after normalization)');
  }
  
  const fullNumber = cleanCountryCode + normalizedPhone;
  
  if (fullNumber.length < 8 || fullNumber.length > 15) {
    throw new Error(`Invalid E.164 phone number length: ${fullNumber.length} digits (must be 8-15)`);
  }
  
  return `+${fullNumber}`;
}

export function formatWhatsAppNumber(phone: string, countryCode: string): string {
  const e164Number = formatE164(phone, countryCode);
  return `whatsapp:${e164Number}`;
}

export function validatePhoneNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const cleanCountryCode = (countryCode || '').trim();
  
  if (!cleanPhone || !cleanCountryCode) {
    return { valid: false, message: 'Phone number and country code are required' };
  }

  try {
    const e164 = formatE164(phone, countryCode);
    return { valid: true };
  } catch (error) {
    const err = error as Error;
    return { valid: false, message: err.message };
  }
}

export function extractCountryCode(fullNumber: string): string {
  const knownCodes = [
    '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', 
    '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61',
    '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95',
    '98', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227',
    '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240',
    '241', '242', '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254',
    '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268',
    '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356',
    '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
    '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502',
    '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595',
    '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679',
    '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
    '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966',
    '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994',
    '995', '996', '998'
  ];
  
  for (const code of knownCodes.sort((a, b) => b.length - a.length)) {
    if (fullNumber.startsWith(code)) {
      return code;
    }
  }
  
  return fullNumber.substring(0, 2);
}
