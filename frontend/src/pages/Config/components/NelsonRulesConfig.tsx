import React from 'react'
import styles from '../Config.module.css'
import { StatusTag } from './StatusTag'
import type { NelsonRule } from '../types'

interface NelsonRulesConfigProps {
  nelsonRules: NelsonRule[]
  onToggleRule: (id: number) => void
}

const severityTag = (severity: string) => {
  if (severity === 'CRITICAL') return <StatusTag label="严重" color="red" />
  if (severity === 'WARNING') return <StatusTag label="警告" color="orange" />
  return <StatusTag label="信息" color="blue" />
}

export const NelsonRulesConfig = React.memo(function NelsonRulesConfig(props: NelsonRulesConfigProps) {
  const { nelsonRules, onToggleRule } = props

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>
          <span className={styles.cardTitleDot} />
          预警规则配置
        </span>
      </div>
      <div className={styles.cardBody}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>规则</th>
              <th>描述</th>
              <th>级别</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {nelsonRules.map(rule => (
              <tr key={rule.id}>
                <td className={styles.tableCellPrimary}>{rule.rule}</td>
                <td>{rule.description}</td>
                <td>{severityTag(rule.severity)}</td>
                <td>
                  <button
                    className={`${styles.toggle} ${rule.enabled ? styles.toggleActive : ''}`}
                    onClick={() => onToggleRule(rule.id)}
                    title={rule.enabled ? '点击禁用' : '点击启用'}
                  >
                    <span className={styles.toggleDot} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})
