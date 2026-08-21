import React from 'react'
import styles from '../Config.module.css'

interface FrequencyStatus {
  current_level: number
  current_interval_minutes: number
  frequency_ladder: number[]
  is_collecting: boolean
  last_collect_time: string | null
}

interface FrequencyConfigProps {
  frequencyStatus: FrequencyStatus | null
}

export const FrequencyConfig = React.memo(function FrequencyConfig(props: FrequencyConfigProps) {
  const { frequencyStatus } = props

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>
          <span className={styles.cardTitleDot} />
          采集频率配置
        </span>
        {frequencyStatus && (
          <span className={styles.freqBadge}>
            L{frequencyStatus.current_level} · {frequencyStatus.current_interval_minutes}min
          </span>
        )}
      </div>
      <div className={styles.cardBody} style={{ padding: '24px' }}>
        {frequencyStatus ? (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              自适应降级阶梯
            </div>
            <div className={styles.freqLadder}>
              {frequencyStatus.frequency_ladder.map((freq: number, idx: number) => {
                const isActive = idx === frequencyStatus.current_level
                const isPast = idx < frequencyStatus.current_level
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && (
                      <div className={`${styles.freqConnector} ${isPast || isActive ? styles.freqConnectorActive : ''}`} />
                    )}
                    <div className={`${styles.freqStep} ${isActive ? styles.freqStepActive : ''} ${isPast ? styles.freqStepPast : ''}`}>
                      <div className={styles.freqStepDot}>
                        {isActive && <div className={styles.freqStepPulse} />}
                      </div>
                      <div className={styles.freqStepLabel}>L{idx}</div>
                      <div className={styles.freqStepValue}>{freq}min</div>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>

            <div className={styles.freqInfo}>
              <div className={styles.freqInfoTitle}>降级策略</div>
              <div className={styles.freqInfoGrid}>
                <div className={styles.freqInfoItem}>
                  <div className={styles.freqInfoIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                    </svg>
                  </div>
                  <div>
                    <div className={styles.freqInfoLabel}>默认频率</div>
                    <div className={styles.freqInfoDesc}>每 5 分钟采集一次数据</div>
                  </div>
                </div>
                <div className={styles.freqInfoItem}>
                  <div className={styles.freqInfoIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
                    </svg>
                  </div>
                  <div>
                    <div className={styles.freqInfoLabel}>自动降级</div>
                    <div className={styles.freqInfoDesc}>连续无数据时逐步降低采集频率</div>
                  </div>
                </div>
                <div className={styles.freqInfoItem}>
                  <div className={styles.freqInfoIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                  </div>
                  <div>
                    <div className={styles.freqInfoLabel}>自动恢复</div>
                    <div className={styles.freqInfoDesc}>采集到新数据后立即恢复至 L0</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>加载中...</div>
        )}
      </div>
    </div>
  )
})
