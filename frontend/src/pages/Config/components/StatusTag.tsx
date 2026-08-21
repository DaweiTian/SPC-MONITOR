import React from 'react'
import styles from '../Config.module.css'

export const StatusTag: React.FC<{ label: string; color: 'green' | 'blue' | 'orange' | 'red' }> = ({ label, color }) => (
  <span className={`${styles.tag} ${styles[`tag${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}>
    <span className={`${styles.tagDot} ${styles[`tagDot${color.charAt(0).toUpperCase() + color.slice(1)}`]}`} />
    {label}
  </span>
)
