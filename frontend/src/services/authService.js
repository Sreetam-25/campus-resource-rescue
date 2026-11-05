import { Amplify } from 'aws-amplify';
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signOut,
  fetchAuthSession,
  getCurrentUser,
  fetchUserAttributes
} from 'aws-amplify/auth';
import { INITIAL_USERS } from '../data/mockUsers.js';

// Configure AWS Amplify v6 with Cognito User Pool
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'ap-southeast-2_ocKlGMqGo',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '6uu9meudsuv2n65r3vtn769fgk',
      signUpVerificationMethod: 'code',
      loginWith: {
        email: true,
      },
    },
  },
});

const CURRENT_USER_SESSION_KEY = 'crr_active_user_session';

export const authService = {
  /**
   * Log in using Cognito USER_SRP_AUTH.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} User session object
   */
  async login(email, password) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const result = await signIn({
      username: normalizedEmail,
      password,
    });

    if (!result.isSignedIn) {
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        const err = new Error('Please verify your email with the confirmation code.');
        err.code = 'UserNotConfirmedException';
        throw err;
      }
      throw new Error(`Sign in requires additional step: ${result.nextStep?.signInStep}`);
    }

    // Fetch user attributes from Cognito
    const attributes = await fetchUserAttributes();
    const safeSessionUser = {
      id: attributes.sub,
      sub: attributes.sub,
      name: attributes.name || normalizedEmail.split('@')[0],
      email: attributes.email || normalizedEmail,
      accountType: attributes['custom:accountType'] || 'Student',
      department: attributes['custom:department'] || 'General Campus',
      role: attributes['custom:accountType'] === 'Department'
        ? `${attributes['custom:department'] || 'Campus'} Staff`
        : `${attributes['custom:department'] || 'Campus'} Student`,
      avatar: (attributes.name || normalizedEmail)
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    };

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(safeSessionUser));
      }
    } catch (e) {}

    return safeSessionUser;
  },

  /**
   * Register a new user with Cognito.
   *
   * @param {{ name: string, email: string, password: string, accountType: string, department: string }} params
   * @returns {Promise<object>} Registration result
   */
  async register({ name, email, password, accountType, department }) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const userAttributes = {
      email: normalizedEmail,
      name: name.trim(),
    };

    if (accountType) {
      userAttributes['custom:accountType'] = accountType;
    }
    if (department) {
      userAttributes['custom:department'] = department.trim();
    }

    const result = await signUp({
      username: normalizedEmail,
      password,
      options: {
        userAttributes,
      },
    });

    return {
      isSignUpComplete: result.isSignUpComplete,
      userId: result.userId,
      nextStep: result.nextStep,
      email: normalizedEmail,
    };
  },

  /**
   * Confirm email address with verification code.
   *
   * @param {string} email
   * @param {string} code
   * @returns {Promise<object>}
   */
  async confirmRegistration(email, code) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const result = await confirmSignUp({
      username: normalizedEmail,
      confirmationCode: (code || '').trim(),
    });
    return result;
  },

  /**
   * Resend sign-up verification code.
   *
   * @param {string} email
   * @returns {Promise<object>}
   */
  async resendCode(email) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    return await resendSignUpCode({ username: normalizedEmail });
  },

  /**
   * Check active Cognito session and retrieve current user.
   *
   * @returns {Promise<object|null>}
   */
  async checkSession() {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens?.accessToken) {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
        }
        return null;
      }

      const attributes = await fetchUserAttributes();
      const safeSessionUser = {
        id: attributes.sub,
        sub: attributes.sub,
        name: attributes.name || attributes.email.split('@')[0],
        email: attributes.email,
        accountType: attributes['custom:accountType'] || 'Student',
        department: attributes['custom:department'] || 'General Campus',
        role: attributes['custom:accountType'] === 'Department'
          ? `${attributes['custom:department'] || 'Campus'} Staff`
          : `${attributes['custom:department'] || 'Campus'} Student`,
        avatar: (attributes.name || attributes.email)
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
      };

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(safeSessionUser));
      }

      return safeSessionUser;
    } catch {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
      }
      return null;
    }
  },

  /**
   * Get cached user synchronously (for immediate UI render).
   */
  getCurrentUser() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const saved = sessionStorage.getItem(CURRENT_USER_SESSION_KEY);
        if (saved) return JSON.parse(saved);
      }
    } catch (e) {}
    return null;
  },

  /**
   * Get raw Cognito Access Token string for API Gateway authorization.
   *
   * @returns {Promise<string|null>}
   */
  async getAccessToken() {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() || null;
    } catch {
      return null;
    }
  },

  /**
   * Sign out current user.
   */
  async logout() {
    try {
      await signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
      }
    } catch (e) {}
    return true;
  },

  /**
   * Predefined demo accounts for UI assistance.
   */
  getTestAccounts() {
    return INITIAL_USERS.map(({ id, name, email, accountType, department, role }) => ({
      id,
      name,
      email,
      accountType,
      department,
      role,
    }));
  },
};
