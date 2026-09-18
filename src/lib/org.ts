/**
 * Everything the privacy notice needs to name a real organisation, kept in env
 * so the code carries no business's details.
 */
export const org = {
  name: process.env.ORG_NAME || "the operator of this system",
  privacyContact: process.env.PRIVACY_CONTACT || "the Privacy Officer",
  privacyEmail: process.env.PRIVACY_CONTACT_EMAIL || "",
  privacyPhone: process.env.PRIVACY_CONTACT_PHONE || "",
  retentionYears: Number(process.env.RETENTION_YEARS || 5),
};
