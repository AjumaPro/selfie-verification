/**
 * Build a dashboard payload from a Skyface KYC response (or a thrown error).
 * Selfie images are never included.
 */

export function isKycApproved(apiResponse) {
  const data = apiResponse?.data || apiResponse || {};
  return (
    data.verified === 'TRUE' ||
    data.verified === true ||
    apiResponse?.verified === 'TRUE'
  );
}

export function buildKycAttemptPayload({
  ghanaCard,
  apiResponse,
  localFaceOk = false,
  error = '',
  source = 'share',
}) {
  const data = apiResponse?.data || apiResponse || {};
  const person =
    data.person && typeof data.person === 'object' ? data.person : {};
  const approved = isKycApproved(apiResponse);
  const message =
    String(data.message || '').trim() ||
    String(error || '').trim() ||
    '';
  return {
    ghanaCard: String(ghanaCard || '').trim(),
    verified: approved,
    forenames: person.forenames || '',
    surname: person.surname || '',
    nationalId: person.nationalId || String(ghanaCard || '').trim(),
    gender: person.gender || '',
    birthDate: person.birthDate || '',
    code: data.code || '',
    message,
    error: error || '',
    transactionGuid: data.transactionGuid || '',
    localFaceOk: !!localFaceOk,
    httpStatus: apiResponse?.httpStatus || data.httpStatus || '',
    person,
    source,
  };
}

export function resultToApiResult(result) {
  if (!result) return null;
  const person = result.person || {};
  return {
    data: {
      verified: result.approved || result.verified ? 'TRUE' : 'FALSE',
      code: result.code || '',
      message: result.message || result.errorText || '',
      transactionGuid: result.transactionGuid || '',
      person: {
        ...person,
        forenames: person.forenames || result.forenames || '',
        surname: person.surname || result.surname || '',
        nationalId: person.nationalId || result.nationalId || result.ghanaCard || '',
        gender: person.gender || result.gender || '',
        birthDate: person.birthDate || result.birthDate || '',
      },
    },
  };
}
