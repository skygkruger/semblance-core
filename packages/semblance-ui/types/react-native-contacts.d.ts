// Ambient type declarations for react-native-contacts
// These types cover the API surface used by packages/mobile/src/native/contacts-bridge.ts

declare module 'react-native-contacts' {
  interface Contact {
    recordID: string;
    givenName: string;
    familyName: string;
    middleName?: string;
    company?: string;
    jobTitle?: string;
    emailAddresses: Array<{ label: string; email: string }>;
    phoneNumbers: Array<{ label: string; number: string }>;
    thumbnailPath?: string;
    birthday?: { year: number; month: number; day: number };
  }

  function checkPermission(): Promise<'authorized' | 'denied' | 'undefined'>;
  function requestPermission(): Promise<'authorized' | 'denied' | 'undefined'>;
  function getAll(): Promise<Contact[]>;
  function getContactById(id: string): Promise<Contact | null>;
}
