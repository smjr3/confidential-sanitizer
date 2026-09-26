import { defineConfig } from 'vite';
import { htmlText } from './src/content/text';

export default defineConfig({
  base: './',
  plugins: [{ name:'catalog-title', transformIndexHtml: html => html.replace('__APP_TITLE__',()=>htmlText('app.title')) }]
});
