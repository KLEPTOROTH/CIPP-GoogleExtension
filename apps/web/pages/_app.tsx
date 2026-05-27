import { CacheProvider, type EmotionCache } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import type { AppProps } from 'next/app';
import Head from 'next/head';

import { createEmotionCache } from '@/createEmotionCache';
import { theme } from '@/theme';

const clientSideEmotionCache = createEmotionCache();

interface CippAppProps extends AppProps {
  emotionCache?: EmotionCache;
}

export default function CippApp(props: CippAppProps) {
  const { Component, emotionCache = clientSideEmotionCache, pageProps } = props;
  return (
    <CacheProvider value={emotionCache}>
      <Head>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
        <title>CIPP-GoogleExtension</title>
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </CacheProvider>
  );
}
