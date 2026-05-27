import createEmotionServer from '@emotion/server/create-instance';
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
  emotionStyleTags: JSX.Element[];
}

export default function CippDocument(props: CippDocumentProps) {
  return (
    <Html lang="en">
      <Head>{props.emotionStyleTags}</Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

CippDocument.getInitialProps = async (
  ctx: DocumentContext,
): Promise<DocumentInitialProps & { emotionStyleTags: JSX.Element[] }> => {
  const originalRenderPage = ctx.renderPage;
  const cache = createEmotionCache();
  const { extractCriticalToChunks } = createEmotionServer(cache);

  ctx.renderPage = () =>
    originalRenderPage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enhanceApp: (App: any) =>
        function EnhanceApp(props: Record<string, unknown>) {
          return <App emotionCache={cache} {...props} />;
        },
    });

  const initialProps = await Document.getInitialProps(ctx);
  const emotionStyles = extractCriticalToChunks(initialProps.html);
  const emotionStyleTags = emotionStyles.styles.map((style) => (
    <style
      data-emotion={`${style.key} ${style.ids.join(' ')}`}
      key={style.key}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: style.css }}
    />
  ));

  return { ...initialProps, emotionStyleTags };
};
