import { describe, expect, it } from 'vitest';

import { getS3EndpointConfig } from './aws';

describe('getS3EndpointConfig', () => {
  it('leaves the AWS endpoint resolver in charge by default', () => {
    expect(getS3EndpointConfig({})).toEqual({});
  });

  it('configures an S3-compatible service explicitly', () => {
    expect(
      getS3EndpointConfig({
        AWS_ENDPOINT_URL_S3: ' http://object-storage:9000 ',
        AWS_S3_FORCE_PATH_STYLE: 'TRUE',
      }),
    ).toEqual({ endpoint: 'http://object-storage:9000', forcePathStyle: true });
  });
});
