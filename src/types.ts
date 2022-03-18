interface User {
  keycloak_id: string;
  student_id?: string;
  name?: string;
}

interface UserContext {
  user?: User;
  roles?: string[];
}

interface ContextRequest {
  headers: {
    'x-user': string;
    'x-roles': string;
  };
}

/*
 * The following interfaces are what data the keycloak token includes.
 *
 * OpenIdToken is defined at https://openid.net/specs/openid-connect-core-1_0.html#IDToken.
 * KeycloakToken is created by inspecting a token from our keycloak instance.
 *
 * Most of these field most likely wont be used.
 */
interface OpenIdToken {
  iss: string;
  sub: string; // User id
  aud: string[];
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  acr?: string;
  amr?: string[];
  azp?: string;
}

interface KeycloakToken {
  jti?: string;
  nbf?: number;
  typ?: string;
  session_state?: string;
  'allowed-origins'?: string[];
  realm_access?: {
    roles?: string[]; // What roles a user has
  };
  resource_access?: {
    'realm-management'?: {
      roles?: string[];
    };
    account?: {
      roles?: string[];
    };
  };
  scope?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string; // Most likely their student id
  given_name?: string;
  family_name?: string;
  email?: string;
  group: string[];
}

type Token = (KeycloakToken & OpenIdToken) | undefined;

type Order = {
  id: number;
  orders: string[];
  isDone: boolean;
};

type MenuItem = {
  name: string;
  imageUrl: string;
};
