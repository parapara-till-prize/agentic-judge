import { Toaster as SonnerToaster } from 'sonner'
import {
  CheckmarkFilled,
  ErrorFilled,
  InformationFilled,
  WarningAltFilled,
} from '@carbon/icons-react'
import styles from '../styles/components/Toaster.module.css'

// App-wide toast host. Sonner handles the queue/animations; we only restyle it to the
// arena look (white surface, our border/radius, Pretendard, accent-green success / red error)
// via class overrides + per-type icons. Mounted once in App.
export default function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={20}
      gap={10}
      duration={3500}
      icons={{
        success: <CheckmarkFilled size={18} />,
        error: <ErrorFilled size={18} />,
        info: <InformationFilled size={18} />,
        warning: <WarningAltFilled size={18} />,
      }}
      toastOptions={{
        classNames: {
          toast: styles.toast,
          title: styles.title,
          description: styles.description,
          icon: styles.icon,
          closeButton: styles.closeButton,
          actionButton: styles.actionButton,
          cancelButton: styles.cancelButton,
        },
      }}
    />
  )
}
