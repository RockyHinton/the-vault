// The Vault - Master Version Configuration
// This file is designed to be the single source of truth for branding and deployment-specific config.
// When remixing for a new client, only this file needs to be updated.

export const APP_CONFIG = {
  // Client Identity
  clientName: "The Vault", // e.g. "Paramount Production Portal"
  clientLogo: null, // Path to logo image, if null uses default text
  primaryColor: "hsl(210 40% 98%)", // Base theme color reference

  // Deployment Settings (Mock values for MVP)
  deploymentId: "master-v1",
  environment: "production",
  
  // Feature Flags
  features: {
    enablePublicSignup: false, // Security: Always false for private deployments
    enableGuestAccess: false,  // Security: Always false
    enableMfa: true,          // Security: Recommended true
    showAuditLogs: true,      // Admin feature
  },

  // Security Policy Display (Visual only in frontend)
  security: {
    sessionTimeout: "30 minutes",
    passwordPolicy: "Strong (12+ chars, mixed case, special char)",
    encryptionStandard: "AES-256 (At Rest)",
  }
};
