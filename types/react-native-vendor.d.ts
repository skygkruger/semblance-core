// Type declarations for React Native packages that may not be installed
// in all development environments (e.g., Windows dev machines).
// These provide sufficient type information for root-level TypeScript compilation.

declare module '@react-navigation/native-stack' {
  import type { ParamListBase } from '@react-navigation/native';

  export type NativeStackNavigationProp<
    ParamList extends ParamListBase,
    RouteName extends keyof ParamList = keyof ParamList,
  > = {
    navigate: <T extends keyof ParamList>(screen: T, params?: ParamList[T]) => void;
    goBack: () => void;
    push: <T extends keyof ParamList>(screen: T, params?: ParamList[T]) => void;
    pop: (count?: number) => void;
    popToTop: () => void;
    setParams: (params: Partial<ParamList[RouteName]>) => void;
  };

  export type NativeStackScreenProps<
    ParamList extends ParamListBase,
    RouteName extends keyof ParamList = keyof ParamList,
  > = {
    navigation: NativeStackNavigationProp<ParamList, RouteName>;
    route: {
      key: string;
      name: RouteName;
      params: ParamList[RouteName];
    };
  };

  export function createNativeStackNavigator<ParamList extends ParamListBase>(): {
    Navigator: React.ComponentType<{ children: React.ReactNode; screenOptions?: Record<string, unknown> }>;
    Screen: React.ComponentType<{ name: keyof ParamList; component: React.ComponentType<unknown>; options?: Record<string, unknown> }>;
  };
}

declare module '@react-navigation/native' {
  export type ParamListBase = Record<string, object | undefined>;

  export function useNavigation<T = unknown>(): T;
  export function useRoute<T = unknown>(): T;
  export function NavigationContainer(props: { children: React.ReactNode }): React.ReactElement;
}

declare module 'react-native-contacts' {
  interface PostalAddress {
    label: string;
    formattedAddress: string;
    street: string;
    pobox: string;
    neighborhood: string;
    city: string;
    region: string;
    state: string;
    postCode: string;
    country: string;
  }

  interface EmailAddress {
    label: string;
    email: string;
  }

  interface PhoneNumber {
    label: string;
    number: string;
  }

  interface Contact {
    recordID: string;
    givenName: string;
    familyName: string;
    middleName: string;
    displayName: string;
    company: string;
    jobTitle: string;
    department: string;
    birthday: { year: number; month: number; day: number } | null;
    emailAddresses: EmailAddress[];
    phoneNumbers: PhoneNumber[];
    postalAddresses: PostalAddress[];
    thumbnailPath: string;
    note: string;
  }

  const Contacts: {
    getAll: () => Promise<Contact[]>;
    getContactById: (id: string) => Promise<Contact | null>;
    checkPermission: () => Promise<'authorized' | 'denied' | 'undefined'>;
    requestPermission: () => Promise<'authorized' | 'denied' | 'undefined'>;
  };

  export default Contacts;
  export type { Contact, EmailAddress, PhoneNumber, PostalAddress };
}
