/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@kolosal-ai/kolosal-ai-core';
import { CloudFreePrivacyNotice } from './CloudFreePrivacyNotice.js';
import { LeftBorderPanel } from '../components/shared/LeftBorderPanel.js';

interface PrivacyNoticeProps {
  onExit: () => void;
  config: Config;
}

const PrivacyNoticeText = ({
  config,
  onExit,
}: {
  config: Config;
  onExit: () => void;
}) => {
  // Only OpenAI authentication is supported now
  return <CloudFreePrivacyNotice config={config} onExit={onExit} />;
};

export const PrivacyNotice = ({ onExit, config }: PrivacyNoticeProps) => (
  <LeftBorderPanel
    accentColor="yellow"
    width="100%"
    marginLeft={1}
    marginTop={1}
    marginBottom={1}
    contentProps={{
      flexDirection: 'column',
      padding: 1,
    }}
  >
    <PrivacyNoticeText config={config} onExit={onExit} />
  </LeftBorderPanel>
);
