export type Phase = 'access' | 'auth' | 'privesc' | 'impact' | 'dos'

export type Priority = 'P0' | 'P1' | 'P2'

export interface AttackChain {
  id: string
  phase: Phase
  priority: Priority
  milestone: string
}

export const chains: AttackChain[] = [
  { id: 'C1', phase: 'access', priority: 'P0', milestone: 'M4' },
  { id: 'C2', phase: 'auth', priority: 'P0', milestone: 'M5' },
  { id: 'C3', phase: 'access', priority: 'P0', milestone: 'M5' },
  { id: 'C4', phase: 'auth', priority: 'P0', milestone: 'M5' },
  { id: 'C5', phase: 'auth', priority: 'P0', milestone: 'M4' },
  { id: 'C6', phase: 'auth', priority: 'P0', milestone: 'M4' },
  { id: 'C7', phase: 'access', priority: 'P1', milestone: 'M6' },
  { id: 'C8', phase: 'privesc', priority: 'P1', milestone: 'M6' },
  { id: 'C9', phase: 'impact', priority: 'P1', milestone: 'M6' },
  { id: 'C10', phase: 'privesc', priority: 'P1', milestone: 'M6' },
  { id: 'C11', phase: 'auth', priority: 'P1', milestone: 'M6' },
  { id: 'C12', phase: 'dos', priority: 'P2', milestone: 'M7' },
  { id: 'C13', phase: 'impact', priority: 'P2', milestone: 'M7' },
  { id: 'C14', phase: 'impact', priority: 'P2', milestone: 'M7' }
]

export interface LabRecipe {
  id: string
  milestone: string
}

export const recipes: LabRecipe[] = [
  { id: 'A', milestone: 'M1' },
  { id: 'B', milestone: 'M5' },
  { id: 'C', milestone: 'M1' },
  { id: 'D', milestone: 'M7' },
  { id: 'E', milestone: 'M6' },
  { id: 'F', milestone: 'M3' },
  { id: 'G', milestone: 'M6' },
  { id: 'H', milestone: 'M6' }
]
