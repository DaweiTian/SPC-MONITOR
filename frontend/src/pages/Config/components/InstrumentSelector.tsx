import React from 'react'
import styles from '../Config.module.css'
import { StatusTag } from './StatusTag'
import type { InstrumentInfo } from '../types'
import { INSTRUMENTS } from '../types'

interface InstrumentSelectorProps {
  currentInstrument: string
  sourceLoading: boolean
  currentInstrumentInfo: InstrumentInfo
  onSwitchInstrument: (id: string) => void
}

export const InstrumentSelector = React.memo(function InstrumentSelector(props: InstrumentSelectorProps) {
  const { currentInstrument, sourceLoading, currentInstrumentInfo, onSwitchInstrument } = props

  return (
    <div className={styles.sourceSection}>
      <div className={styles.sourceHeader}>
        <span className={styles.sourceTitle}>
          <span className={styles.cardTitleDot} />
          仪器选择
        </span>
        <StatusTag label={currentInstrumentInfo.name} color="green" />
      </div>
      <div className={styles.instrumentGrid}>
        {INSTRUMENTS.map(instrument => (
          <button
            key={instrument.id}
            className={`${styles.instrumentBtn} ${currentInstrument === instrument.id ? styles.instrumentBtnActive : ''}`}
            onClick={() => onSwitchInstrument(instrument.id)}
            disabled={sourceLoading}
          >
            <span className={styles.instrumentIcon}>
              {instrument.type === 'mock' ? '🎭' : instrument.type === 'mdb' ? '📁' : '🗄️'}
            </span>
            <span className={styles.instrumentName}>{instrument.name}</span>
            <span className={styles.instrumentType}>
              {instrument.type === 'mock' ? '模拟数据' : instrument.type === 'mdb' ? 'MDB 文件' : 'SQL Server'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})
