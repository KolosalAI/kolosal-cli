/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, type DOMElement, measureElement } from 'ink';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Colors } from '../../colors.js';

const DEFAULT_RULE_CHARACTER = '│';

type BoxProps = ComponentProps<typeof Box>;

/**
 * A panel with a consistent left border that respects the layout constraints of its parent.
 */
export interface LeftBorderPanelProps extends Omit<BoxProps, 'children'> {
  children: ReactNode;
  /** Color for the left border rule. Defaults to a neutral gray tone. */
  accentColor?: string;
  /** Background color to apply behind the panel contents. */
  backgroundColor?: string;
  /** Character to render for the vertical rule. */
  borderCharacter?: string;
  /** Spacing between the rule and the panel content. Defaults to 1 column. */
  ruleMarginRight?: number;
  /** Additional props applied to the inner content box. */
  contentProps?: Omit<BoxProps, 'children' | 'ref'>;
}

export function LeftBorderPanel({
  children,
  accentColor = Colors.Gray,
  backgroundColor,
  borderCharacter = DEFAULT_RULE_CHARACTER,
  ruleMarginRight = 1,
  contentProps,
  ...outerBoxProps
}: LeftBorderPanelProps) {
  const { width: outerWidth, flexGrow: outerFlexGrow, ...restOuterBoxProps } =
    outerBoxProps;
  const contentRef = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(1);

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }
    const { height } = measureElement(contentRef.current);
    const nextHeight = typeof height === 'number' && height > 0 ? height : 1;
    setContentHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  });

  const verticalRule = useMemo(() => {
    const rows = Math.max(contentHeight, 1);
    const ruleChar = borderCharacter || DEFAULT_RULE_CHARACTER;
    return Array.from({ length: rows }, () => ruleChar).join('\n') || ruleChar;
  }, [borderCharacter, contentHeight]);

  const {
    flexDirection: contentFlexDirection,
    flexGrow: contentFlexGrow,
    ...restContentProps
  } = contentProps ?? {};

  return (
    <Box
      flexDirection="row"
      width={outerWidth ?? '100%'}
      flexGrow={outerFlexGrow ?? 0}
      minWidth={0}
      {...restOuterBoxProps}
    >
      <Box marginRight={ruleMarginRight}>
        <Text color={accentColor}>{verticalRule}</Text>
      </Box>
      <Box
        ref={contentRef}
        flexDirection={contentFlexDirection ?? 'column'}
        flexGrow={contentFlexGrow ?? 1}
        minWidth={0}
        minHeight={0}
        {...restContentProps}
      >
        {children}
      </Box>
    </Box>
  );
}
