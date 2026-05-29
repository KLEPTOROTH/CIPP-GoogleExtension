import createEmotionServer from '@emotion/server/create-instance';
import React from 'react';
import Document, {
  type DocumentContext,
  type DocumentInitialProps,
  type DocumentProps,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document';

import { createEmotionCache } from '@/createEmotionCache';

interface CippDocumentProps extends DocumentProps {
  emotionStyleTags: React.ReactElement[];
}

export default class CippDocument extends Document<CippDocumentProps> {
  static override async getInitialProps(
    ctx: DocumentContext,
  ): Promise<DocumentInitialProps & { emotionStyleTags: React.ReactElement[] }> {
    const originalRenderPage = ctx.renderPage;
    const cache = createEmotionCache();
    const { extractCriticalToChunks } = createEmotionServer(cache);

    ctx.renderPage = () =>
      originalRenderPage({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enhanceApp: (App: any) =>
          function EnhanceApp(props: Record<string, unknown>) {
            return React.createElement(App, { emotionCache: cache, ...props });
          },
      });

    const initialProps = await Document.getInitialProps(ctx);
    const emotionStyles = extractCriticalToChunks(initialProps.html);
    const emotionStyleTags = emotionStyles.styles.map((style) =>
      React.createElement('style', {
        'data-emotion': `${style.key} ${style.ids.join(' ')}`,
        key: style.key,
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML: { __html: style.css },
      }),
    );

    return { ...initialProps, emotionStyleTags };
  }

  override render() {
    return React.createElement(
      Html,
      { lang: 'en' },
      React.createElement(Head, null, this.props.emotionStyleTags),
      React.createElement(
        'body',
        null,
        React.createElement(Main),
        React.createElement(NextScript),
      ),
    );
  }
}
