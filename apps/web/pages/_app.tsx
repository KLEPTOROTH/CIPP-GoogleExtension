import { CacheProvider, type EmotionCache } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import React from 'react';

import { createEmotionCache } from '@/createEmotionCache';
import { theme } from '@/theme';

const clientSideEmotionCache = createEmotionCache();

interface CippAppProps extends AppProps {
  emotionCache?: EmotionCache;
}

export default function CippApp(props: CippAppProps) {
  const { Component, emotionCache = clientSideEmotionCache, pageProps } = props;
  return React.createElement(
    CacheProvider,
    { value: emotionCache },
    React.createElement(
      Head,
      null,
      React.createElement('meta', {
        name: 'viewport',
        content: 'initial-scale=1, width=device-width',
      }),
      React.createElement('title', null, 'CIPP-GoogleExtension'),
    ),
    React.createElement(
      ThemeProvider,
      { theme },
      React.createElement(CssBaseline),
      React.createElement(Component, pageProps),
    ),
  );
}
