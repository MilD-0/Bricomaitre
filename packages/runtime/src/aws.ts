type S3EndpointEnvironment = {
  [key: string]: string | undefined;
  AWS_ENDPOINT_URL_S3?: string;
  AWS_S3_FORCE_PATH_STYLE?: string;
};

export function getS3EndpointConfig(env: S3EndpointEnvironment = process.env) {
  const endpoint = env.AWS_ENDPOINT_URL_S3?.trim();
  const forcePathStyle = env.AWS_S3_FORCE_PATH_STYLE?.trim().toLowerCase() === 'true';

  return {
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
  };
}
