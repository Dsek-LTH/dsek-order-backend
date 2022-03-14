import axios from 'axios';
import { IncomingHttpHeaders } from 'http';
import { verify } from 'jsonwebtoken';

let pemCache: string | undefined;
const pemCacheTtl = 60 * 1000;
const keycloakAddress = 'https://portal.dsek.se/auth/realms/dsek/';

/**
 * turns dsek.sexm.kok.mastare into ['dsek', 'dsek.sexm', 'dsek.sexm.kok', 'dsek.sexm.kok.mastare']
 * @param id the key of the position
 * @returns return a list of roles part of the position
 */
function getRoleNames(id: string): string[] {
  const parts = id.split('.');
  return [...Array(parts.length).keys()].map((i) =>
    parts.slice(0, i + 1).join('.')
  );
}

export const userIsAdmin = async (
  headers: IncomingHttpHeaders
): Promise<boolean> => {
  const user = await getUser(headers);
  console.log(user);
  return (
    !!user?.roles?.includes('dsek.sexm') || !!user?.roles?.includes('dsek.infu')
  );
};

export const getUser = async (
  headers: IncomingHttpHeaders
): Promise<UserContext | undefined> => {
  const decodedToken = await verifyAndDecodeToken(headers);
  if (!decodedToken) {
    return undefined;
  }
  return {
    user: {
      keycloak_id: decodedToken.sub,
      student_id: decodedToken.preferred_username,
      name: decodedToken.name,
    },
    roles: Array.from(
      new Set(
        decodedToken.group
          .map((group) => getRoleNames(group))
          .join()
          .split(',')
      )
    ),
  };
};

const verifyAndDecodeToken = async (
  headers: IncomingHttpHeaders
): Promise<Token> => {
  const { authorization } = headers;
  if (!authorization) return undefined;
  const token = authorization.split(' ')[1]; // Remove "Bearer" from token
  let pem = pemCache; // To avoid race conditions
  if (!pem) {
    const res = await axios.get(keycloakAddress);
    const key = res.data.public_key;
    pemCache = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
    pem = pemCache;
    setTimeout(() => {
      pemCache = undefined;
    }, pemCacheTtl);
  }

  try {
    return verify(token, pem) as KeycloakToken & OpenIdToken;
  } catch (e) {
    return undefined;
  }
};
