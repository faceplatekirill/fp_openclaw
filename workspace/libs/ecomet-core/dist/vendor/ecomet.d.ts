/**
 * Type declarations for ecomet.js
 */

export class Ecomet {
  constructor();
  
  connect(
    host: string,
    port: number,
    protocol: string,
    onConnect: () => void,
    onError: (error: unknown) => void,
    onClose: () => void
  ): void;
  
  login(
    user: string,
    password: string,
    onSuccess: () => void,
    onError: (error: unknown) => void,
    timeout: number
  ): void;
  
  query<T = unknown>(
    statement: string,
    onSuccess: (result: T) => void,
    onError: (error: unknown) => void,
    timeout: number
  ): void;
  
  is_ok(): boolean;
  
  close(): void;
}
