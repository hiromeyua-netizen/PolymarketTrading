export interface Config {
  port: number;
  wallet: {
    privateKey: string;
    funderAddress: string;
  };
}

