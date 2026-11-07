export type GoogleLoginProps = {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onCredential: (credential: string) => Promise<void>;
  onError: (error: unknown) => void;
};
