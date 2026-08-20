import React from 'react'
import styles from './Help.module.css'

const modules = [
  { title: '实时看板', desc: '：展示今日检测量、预警数、采集状态等关键指标，实时刷新数据趋势' },
  { title: 'SPC控制图', desc: '：支持I-MR和X-bar R控制图，自动计算控制限，标注Nelson判异规则违规点' },
  { title: '过程能力', desc: '：计算Cp/Cpk/Pp/Ppk，直方图+正态分布曲线，西格玛水平和PPM不合格率' },
  { title: '指标预测', desc: '：基于历史数据的趋势预测，支持移动平均、指数平滑、ARIMA模型' },
  { title: '预警中心', desc: '：分级预警管理，支持确认、处理、关闭全流程，预警趋势分析' },
  { title: '数据管理', desc: '：FT1原始数据浏览、筛选、导出' },
  { title: '配置管理', desc: '：品项、指标、规格限、采集频率、预警规则的可视化配置' },
]

const nelsonRules = [
  { rule: '规则1', desc: '1点超出3σ控制限', type: '突发异常' },
  { rule: '规则2', desc: '连续9点在中心线同侧', type: '均值偏移' },
  { rule: '规则3', desc: '连续6点递增或递减', type: '趋势异常' },
  { rule: '规则4', desc: '连续14点交替上下', type: '数据分层' },
  { rule: '规则5', desc: '连续3点中2点在2σ外', type: '中等偏移' },
  { rule: '规则6', desc: '连续5点中4点在1σ外', type: '小偏移' },
  { rule: '规则7', desc: '连续15点在1σ内', type: '数据异常集中' },
  { rule: '规则8', desc: '连续8点无1点在1σ内', type: '数据过度分散' },
]

export const HelpPage: React.FC = () => {
  return (
    <div className={styles.container}>
      <h3 className={styles.sectionTitle}>系统简介</h3>
      <p>
        液奶过程监控系统是一套面向乳制品生产过程的实时SPC分析平台，集成FT1数据定时采集、统计过程控制（SPC）分析、过程能力评估、指标趋势预测和分级预警功能，帮助质量管理人员实时掌握生产过程稳定性。
      </p>

      <h3 className={styles.sectionTitle}>功能模块说明</h3>
      <ul className={styles.moduleList}>
        {modules.map((m) => (
          <li key={m.title} className={styles.moduleItem}>
            <span className={styles.moduleTitle}>{m.title}</span>{m.desc}
          </li>
        ))}
      </ul>

      <h3 className={styles.sectionTitle}>技术架构</h3>
      <ul className={styles.archList}>
        <li className={styles.archItem}>前端：React + Element Plus + ECharts</li>
        <li className={styles.archItem}>后端：Python (FastAPI + NumPy + SciPy + Statsmodels)</li>
        <li className={styles.archItem}>启动器：Rust (进程管理 + 系统托盘)</li>
        <li className={styles.archItem}>实时通信：WebSocket</li>
      </ul>

      <h3 className={styles.sectionTitle}>SPC判异规则（Nelson Rules）</h3>
      <table className={styles.rulesTable}>
        <thead>
          <tr>
            <th>规则</th>
            <th>描述</th>
            <th>异常类型</th>
          </tr>
        </thead>
        <tbody>
          {nelsonRules.map((r) => (
            <tr key={r.rule}>
              <td className={styles.ruleName}>{r.rule}</td>
              <td>{r.desc}</td>
              <td>{r.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
