/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
import type { WizardStepProps } from '../types.js';

interface LocationOption {
  label: string;
  value: 'project' | 'user';
}

const locationOptions: LocationOption[] = [
  {
    label: 'Project Level (.kolosalagents/)',
    value: 'project',
  },
  {
    label: 'User Level (~/.kolosalagents/)',
    value: 'user',
  },
];

/**
 * Step 1: Location selection for subagent storage.
 */
export function LocationSelector({ state, dispatch, onNext }: WizardStepProps) {
  const handleSelect = (selectedValue: string) => {
    const location = selectedValue as 'project' | 'user';
    dispatch({ type: 'SET_LOCATION', location });
    onNext();
  };

  return (
    <Box flexDirection="column">
      <RadioButtonSelect
        items={locationOptions.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        initialIndex={locationOptions.findIndex(
          (opt) => opt.value === state.location,
        )}
        onSelect={handleSelect}
        isFocused={true}
      />
    </Box>
  );
}
