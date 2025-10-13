/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';
import {
  requestDeviceCode,
  pollForToken,
  openBrowser,
  sleep,
  type DeviceCodeResponse,
  type TokenResponse,
} from '../../config/oauth.js';

interface OAuthDeviceFlowProps {
  onSuccess: (accessToken: string, user?: { id: string; email: string }) => void;
  onCancel: () => void;
}

type FlowState = 'requesting' | 'waiting' | 'success' | 'error' | 'expired';

export function OAuthDeviceFlow({
  onSuccess,
  onCancel,
}: OAuthDeviceFlowProps): React.JSX.Element {
  const [state, setState] = useState<FlowState>('requesting');
  const [deviceFlow, setDeviceFlow] = useState<DeviceCodeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useKeypress(
    (key) => {
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        onCancel();
      }
    },
    { isActive: true },
  );

  useEffect(() => {
    let isMounted = true;

    async function startFlow() {
      try {
        // Request device code
        const response = await requestDeviceCode();
        if (!isMounted) return;
        
        setDeviceFlow(response);
        setState('waiting');

        // Open browser automatically (only once)
        openBrowser(response.verification_uri_complete);

        // Start polling for token
        const maxAttempts = Math.floor(response.expires_in / response.interval);
        let attempts = 0;
        let interval = response.interval;

        while (attempts < maxAttempts && isMounted) {
          await sleep(interval * 1000);
          if (!isMounted) return;

          const result = await pollForToken(response.device_code);
          if (!isMounted) return;

          // Check if we got a token
          if ('access_token' in result) {
            const tokenResponse = result as TokenResponse;
            setState('success');
            onSuccess(tokenResponse.access_token, tokenResponse.user);
            return;
          }

          // Handle errors
          const errorResult = result as { error: string; error_description: string };
          
          if (errorResult.error === 'authorization_pending') {
            attempts++;
            continue;
          }

          if (errorResult.error === 'slow_down') {
            interval += 5;
            continue;
          }

          if (errorResult.error === 'expired_token') {
            setState('expired');
            setErrorMessage('Authentication timed out. Please try again.');
            return;
          }

          if (errorResult.error === 'access_denied') {
            setState('error');
            setErrorMessage('Authentication was denied.');
            return;
          }

          if (errorResult.error === 'network_error' || errorResult.error === 'server_error') {
            setState('error');
            setErrorMessage(errorResult.error_description || 'Authentication failed');
            return;
          }

          setState('error');
          setErrorMessage(errorResult.error_description || 'Authentication failed');
          return;
        }

        // Timeout
        if (isMounted) {
          setState('expired');
          setErrorMessage('Authentication timed out. Please try again.');
        }
      } catch (error) {
        if (!isMounted) return;
        setState('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to start authentication',
        );
      }
    }

    void startFlow();

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - run only once on mount

  if (state === 'requesting') {
    return (
      <LeftBorderPanel
        accentColor={Colors.AccentBlue}
        backgroundColor={getPanelBackgroundColor()}
        width="100%"
        marginLeft={1}
        marginTop={1}
        marginBottom={1}
        contentProps={{
          flexDirection: 'column',
          padding: 1,
        }}
      >
        <Box>
          <Text>
            <Spinner type="dots" /> Initializing authentication...
          </Text>
        </Box>
      </LeftBorderPanel>
    );
  }

  if (state === 'waiting' && deviceFlow) {
    return (
      <LeftBorderPanel
        accentColor={Colors.AccentBlue}
        backgroundColor={getPanelBackgroundColor()}
        width="100%"
        marginLeft={1}
        marginTop={1}
        marginBottom={1}
        contentProps={{
          flexDirection: 'column',
          padding: 1,
        }}
      >
        <Text bold color={Colors.AccentBlue}>
          Login to Kolosal Cloud
        </Text>
        <Box marginTop={1}>
          <Text>
            A browser window should have opened automatically.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>If not, please visit:</Text>
        </Box>
        <Box marginTop={1} marginLeft={2}>
          <Text color={Colors.AccentBlue} bold>
            {deviceFlow.verification_uri}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>And enter this code:</Text>
        </Box>
        <Box marginTop={1} marginLeft={2}>
          <Text color="yellow" bold>
            {deviceFlow.user_code}
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text color={Colors.Gray}>
            <Spinner type="dots" /> Waiting for authorization...
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            Press Esc or Ctrl+C to cancel
          </Text>
        </Box>
      </LeftBorderPanel>
    );
  }

  if (state === 'success') {
    return (
      <LeftBorderPanel
        accentColor="green"
        backgroundColor={getPanelBackgroundColor()}
        width="100%"
        marginLeft={1}
        marginTop={1}
        marginBottom={1}
        contentProps={{
          flexDirection: 'column',
          padding: 1,
        }}
      >
        <Text color="green" bold>
          ✓ Successfully authenticated!
        </Text>
      </LeftBorderPanel>
    );
  }

  if (state === 'error' || state === 'expired') {
    return (
      <LeftBorderPanel
        accentColor={Colors.AccentRed}
        backgroundColor={getPanelBackgroundColor()}
        width="100%"
        marginLeft={1}
        marginTop={1}
        marginBottom={1}
        contentProps={{
          flexDirection: 'column',
          padding: 1,
        }}
      >
        <Text color={Colors.AccentRed} bold>
          ✗ Authentication Failed
        </Text>
        <Box marginTop={1}>
          <Text>{errorMessage}</Text>
        </Box>
        {errorMessage.includes('not yet available') && (
          <Box marginTop={1}>
            <Text color={Colors.Gray}>
              Tip: You can use the "Use OpenAI Compatible API" option to connect with an API key instead.
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            Press Esc to go back
          </Text>
        </Box>
      </LeftBorderPanel>
    );
  }

  return <></>;
}
