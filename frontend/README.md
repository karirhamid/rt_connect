# RT Connect Frontend

React + Vite application for workforce management system with device integration and attendance tracking.

## Technologies

- **React 18** with Vite for fast development and HMR
- **TailwindCSS** for styling
- **react-i18next** for internationalization (FR/EN/AR)
- **Lucide React** for icons
- **React Router** for navigation

## Internationalization (i18n)

The application supports three languages:
- **French (FR)** - Default language
- **English (EN)**
- **Arabic (AR)** - With RTL support

### Managing Translations

All translations are centralized in `src/i18n.js`. To add or modify translations:

1. **Add a new translation key:**
   ```javascript
   // In src/i18n.js
   resources: {
     fr: {
       translation: {
         myNewKey: "Mon nouveau texte",
         // ... other keys
       }
     },
     en: {
       translation: {
         myNewKey: "My new text",
         // ... other keys
       }
     },
     ar: {
       translation: {
         myNewKey: "النص الجديد",
         // ... other keys
       }
     }
   }
   ```

2. **Use in components:**
   ```javascript
   import { useTranslation } from 'react-i18next';
   
   function MyComponent() {
     const { t } = useTranslation();
     return <h1>{t('myNewKey')}</h1>;
   }
   ```

3. **Language switching:**
   - Users can switch languages via the Settings > General page
   - Language preference is saved to localStorage
   - RTL layout is automatically applied for Arabic

### Adding a New Language

1. Add language resources in `src/i18n.js`:
   ```javascript
   resources: {
     // ... existing languages
     es: {
       translation: {
         // Spanish translations
       }
     }
   }
   ```

2. Update the language selector in `src/pages/GeneralSettings.jsx`

3. Add RTL support if needed in `src/i18n.js` init configuration

## Development

```bash
npm install
npm run dev
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
