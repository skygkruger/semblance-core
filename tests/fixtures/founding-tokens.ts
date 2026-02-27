/**
 * Test fixture tokens for founding member verification tests.
 *
 * All tokens are signed with the TEST Ed25519 keypair embedded in founding-token.ts.
 * The corresponding test private key PEM is included here for generating additional
 * test tokens if needed.
 *
 * NEVER use the test private key in production. The production keypair is generated
 * and held by the semblance-run backend.
 */

// Test private key (Ed25519) — for generating fixture tokens only.
// The public key counterpart is embedded in packages/core/premium/founding-token.ts.
export const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJDzBEnzx4yNvTSgbI1UgiYbzs7lARqSGtzmqNRc+q8t
-----END PRIVATE KEY-----`;

export const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAeOrN1OgTzVAT9Y9LtGqnpR8/bYEdayuEMtSi9gqK1c=
-----END PUBLIC KEY-----`;

// ─── Pre-signed test tokens ─────────────────────────────────────────────────

/** Valid founding member token — seat #1 */
export const VALID_TOKEN_SEAT_1 = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5MjYxYjQ1ZTc2OGJmOGM1NTZjMDRiY2EyNTI2MjliZTk0MzRmMDZhMmUxMTg1NTJhZDQ3ZGYxODYyZWMwYTE5IiwidGllciI6ImZvdW5kaW5nIiwiaWF0IjoxNzcyMTQyMDM2LCJzZWF0IjoxfQ.enu7JvQ1qOLeEV1PZeVg80aAgzERpXX6pmEhRRwV9WQ8a1iyzT_7X4LIVSyJwqPxiLRNMPHjJAiMjjgzWKhOBw';

/** Valid founding member token — seat #500 (max) */
export const VALID_TOKEN_SEAT_500 = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMjhiZmJiM2I1YjdhNGNlNjhhMTM5ZDFkZTc2YWQ4MTdiNmQ1YmYzOGE3MzMwZDE2MzRkODY0OTdiZmNmODQ4IiwidGllciI6ImZvdW5kaW5nIiwiaWF0IjoxNzcyMTQyMDM2LCJzZWF0Ijo1MDB9.8jmm16YTmw-GiTkIWbiGbbxr6jW1voSNFoIwFChao44EtD05SiQdYioaSoW9mV6n-wxWXcT8RA6pRo8tuuxeBg';

/** Token with wrong tier ('premium' instead of 'founding') */
export const WRONG_TIER_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NzNkZmU0NjNlYzg1Nzg1ZjVmOTVhZjViYTM5MDZlZWRiMmQ5MzFjMjRlNjk4MjRhODllYTY1ZGJhNGU4MTNiIiwidGllciI6InByZW1pdW0iLCJpYXQiOjE3NzIxNDIwMzYsInNlYXQiOjF9.zOO8nnkQuWmvxGSeaAP8bktKhm2uh72ZBwSLomJEmBdKlvCpOpeW3_50VP2RrYtRibXyTIcROeezQBO-xh4VAw';

/** Token with missing seat field */
export const MISSING_SEAT_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NzNkZmU0NjNlYzg1Nzg1ZjVmOTVhZjViYTM5MDZlZWRiMmQ5MzFjMjRlNjk4MjRhODllYTY1ZGJhNGU4MTNiIiwidGllciI6ImZvdW5kaW5nIiwiaWF0IjoxNzcyMTQyMDM2fQ.F4i5WeqOdYis9h6iyZ_ReSQMI7oL-LDjA47utFZBm2fcB9Ev9le69Uf4-ccugwGMsSGZ39i_mpQMhL9SqHUqDA';

/** Token with seat number out of range (501, max is 500) */
export const SEAT_OUT_OF_RANGE_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NzNkZmU0NjNlYzg1Nzg1ZjVmOTVhZjViYTM5MDZlZWRiMmQ5MzFjMjRlNjk4MjRhODllYTY1ZGJhNGU4MTNiIiwidGllciI6ImZvdW5kaW5nIiwiaWF0IjoxNzcyMTQyMDM2LCJzZWF0Ijo1MDF9.pCamarWsyMDt9TlzrEAdSNaPmBh5Zn9jrZNWoxHDNR8CChRMOhY2jRGDJCqeG4EGiYt9t8q4ggOGdlJvpvM2CQ';

/** Token with tampered signature (last char modified) */
export const TAMPERED_SIGNATURE_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5MjYxYjQ1ZTc2OGJmOGM1NTZjMDRiY2EyNTI2MjliZTk0MzRmMDZhMmUxMTg1NTJhZDQ3ZGYxODYyZWMwYTE5IiwidGllciI6ImZvdW5kaW5nIiwiaWF0IjoxNzcyMTQyMDM2LCJzZWF0IjoxfQ.enu7JvQ1qOLeEV1PZeVg80aAgzERpXX6pmEhRRwV9WQ8a1iyzT_7X4LIVSyJwqPxiLRNMPHjJAiMjjgzWKhOBA';

/** Completely invalid string (not a JWT) */
export const INVALID_FORMAT_TOKEN = 'not-a-valid-jwt-token';

/** Empty string */
export const EMPTY_TOKEN = '';
