Using Node.js 20, Tailwind CSS v3.4.19, and Vite v7.2.4

Tailwind CSS has been set up with the shadcn theme

Setup complete: /mnt/okcomputer/output/app

Components (40+):
  accordion, alert-dialog, alert, aspect-ratio, avatar, badge, breadcrumb,
  button-group, button, calendar, card, carousel, chart, checkbox, collapsible,
  command, context-menu, dialog, drawer, dropdown-menu, empty, field, form,
  hover-card, input-group, input-otp, input, item, kbd, label, menubar,
  navigation-menu, pagination, popover, progress, radio-group, resizable,
  scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
  spinner, switch, table, tabs, textarea, toggle-group, toggle, tooltip

Usage:
  import { Button } from '@/components/ui/button'
  import { Card, CardHeader, CardTitle } from '@/components/ui/card'

Structure:
  frontend/src/sections/   Page sections
  frontend/src/hooks/      Custom hooks
  frontend/src/App.css     Styles specific to the Webapp
  frontend/src/App.tsx     Root React component
  frontend/src/index.css   Global styles
  frontend/src/main.tsx    Entry point for rendering the Webapp
  frontend/index.html      Entry point for the Webapp
  backend/api/             Relay backend (LINE webhook + MLflow logging)
  backend/database/        Database schema/migration/config files
  backend/services/        Reserved service layer for backend modules
  backend/models/          Reserved backend models/types
  backend/uploads/         Uploaded images (runtime)
  ai/                      Placeholder for AI/model assets
  ai_service/              AI/ML service container files
  tailwind.config.js   Configures Tailwind's theme, plugins, etc.
  vite.config.ts       Main build and dev server settings for Vite
  postcss.config.js    Config file for CSS post-processing tools
