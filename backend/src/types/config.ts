export interface Config {
  port: number;
  wallet: {
    privateKey: string;
    funderAddress: string;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  mongodb?: {
    uri: string;
  };
}

