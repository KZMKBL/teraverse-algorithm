// path: src/app/(dashboard)/page.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDungeonStateAction, playMoveAction, startRunAction } from '@/actions/gigaverseActions'
import { callGigaverseAction } from '@/utils/callGigaverseAction'
import { useAuthStore } from '@/store/useAuthStore'
import { useGigaverseStore } from '@/store/useGigaverseStore'
import { useAlgorithmStore } from '@/store/useAlgorithmStore'
import { useGameDataStore } from '@/store/useGameDataStore'
import {
  buildGigaverseRunState,
  MctsAlgorithm,
  MinimaxAlgorithm,
  DPAlgorithm,
  GreedyAlgorithm,
  GigaverseActionType,
} from '@slkzgm/gigaverse-engine'

import { hybridEvaluate } from '@slkzgm/gigaverse-engine';

import { silentLogger } from '@/utils/silentLogger'
import type { GameItemBalanceChange } from '@slkzgm/gigaverse-sdk'
import { useRunHistoryStore } from '@/store/useRunHistoryStore'
import { Button } from '@/components/ui/button'
import { RefreshCw, Play, Pause } from 'lucide-react'
import { DashboardHeader } from '@/app/(dashboard)/_components/dashboard-header'
import { EnergyDisplay } from '@/app/(dashboard)/_components/energy-display'
import { AlgorithmSelector } from '@/app/(dashboard)/_components/algorithm-selector'
import { ActiveRunPanel } from '@/app/(dashboard)/_components/active-run-panel'
import { DungeonList } from '@/app/(dashboard)/_components/dungeon-list'
import { RunRecapPanel } from '@/app/(dashboard)/_components/run-recap-panel'
import { RomManagerPanel } from '@/app/(dashboard)/_components/rom-manager-panel'
import { RunTabsPanel } from '@/app/(dashboard)/_components/run-tabs-panel'

// --- ÖZEL LOGGER (BOTUN SESİNİ AÇIYORUZ) ---
const browserLogger = {
  info: (msg: string) => console.log(`%c[BOT] ${msg}`, 'color: #00ffff; font-weight: bold;'),
  warn: (msg: string) => console.warn(`[BOT WARN] ${msg}`),
  error: (msg: string) => console.error(`[BOT ERROR] ${msg}`),
  debug: (msg: string) => console.log(`%c[DEBUG] ${msg}`, 'color: #aaaaaa; font-style: italic;'),

}

export default function DashboardPage() {
  const { bearerToken } = useAuthStore()
  const {
    address,
    username,
    noobId,
    dungeonState,
    energyData,
    stopEnergyTimer,
    loadEnergy,
    loadDayProgress,
    incrementRunCount,
    dayProgressMap,
  } = useGigaverseStore()
  const {
    loadOffchainStatic,
    loadTodayDungeonData,
    enemies,
    gameItems,
    todayDungeonsMap,
    isLoading,
    error,
  } = useGameDataStore()
  const { selectedAlgorithm, autoPlay, setAutoPlay } = useAlgorithmStore()
  const { addRun } = useRunHistoryStore()

  const [localError, setLocalError] = useState('')
  const [balanceChangesHistory, setBalanceChangesHistory] = useState<GameItemBalanceChange[]>([])
  const [finalEnemiesDefeated, setFinalEnemiesDefeated] = useState(0)
  const [currentDungeonName, setCurrentDungeonName] = useState('')
  const [currentDungeonIsJuiced, setCurrentDungeonIsJuiced] = useState(false)

  const algoRefs = useRef<{
    mcts: MctsAlgorithm | null
    minimax: MinimaxAlgorithm | null
    dp: DPAlgorithm | null
    greedy: GreedyAlgorithm | null
  }>({
    mcts: null,
    minimax: null,
    dp: null,
    greedy: null,
  })

  const isAutoPlayingRef = useRef(false)

  const currentDungeonNameRef = useRef('')
  const currentDungeonIsJuicedRef = useRef(false)
  const autoPlayRef = useRef(autoPlay)

  useEffect(() => {
    currentDungeonNameRef.current = currentDungeonName
    currentDungeonIsJuicedRef.current = currentDungeonIsJuiced
    autoPlayRef.current = autoPlay
  }, [currentDungeonName, currentDungeonIsJuiced, autoPlay])

  // Instantiate algorithm objects when selectedAlgorithm changes.
  useEffect(() => {
    algoRefs.current.mcts = null
    algoRefs.current.minimax = null
    algoRefs.current.dp = null
    algoRefs.current.greedy = null

    switch (selectedAlgorithm) {
      case 'mcts':
        algoRefs.current.mcts = new MctsAlgorithm(
          { simulationsCount: 300, maxDepth: 2 },
          silentLogger
        )
        break
      case 'minimax':
        algoRefs.current.minimax = new MinimaxAlgorithm({ maxDepth: 3 }, silentLogger)
        break
      case 'dp':
        // Use hybridEvaluate here. Also use browserLogger for better visibility in UI.
        algoRefs.current.dp = new DPAlgorithm(
          { maxHorizon: 6, evaluateFn: hybridEvaluate as any },
          browserLogger as any
        )
        break
      case 'greedy':
        algoRefs.current.greedy = new GreedyAlgorithm({ atkWeight: 2.0 }, silentLogger)
        break
      default:
        break
    }
  }, [selectedAlgorithm])

  // Data loading: simplified dependencies to avoid repeated refetch.
  useEffect(() => {
    if (!bearerToken || !address) return
    // load static/offchain data once on mount
    loadOffchainStatic(bearerToken)
    loadTodayDungeonData(bearerToken)
    loadDayProgress(bearerToken)
    loadEnergy(bearerToken)

    return () => {
      stopEnergyTimer()
    }
    // Intentionally only depends on bearerToken & address
  }, [bearerToken, address, loadOffchainStatic, loadTodayDungeonData, loadDayProgress, loadEnergy, stopEnergyTimer])

  // Fetch current dungeon state once mounted (and whenever bearerToken changes)
  useEffect(() => {
    if (!bearerToken) return
    let mounted = true
    async function fetchOnMount() {
      setLocalError('')
      const result = await callGigaverseAction(fetchDungeonStateAction, bearerToken!)
      if (!mounted) return
      if (!result.success && result.message) {
        setLocalError(result.message)
      } else if (result.data?.entity?.ID_CID) {
        const dungeonId = Number(result.data.entity.ID_CID)
        const dungeonName = todayDungeonsMap[dungeonId]?.NAME_CID ?? `Dungeon #${dungeonId}`
        setCurrentDungeonName(dungeonName)
      }
    }
    fetchOnMount()
    return () => { mounted = false }
  }, [bearerToken, todayDungeonsMap])

  const getAggregatedItemChanges = useCallback(() => {
    const map: Record<number, number> = {}
    for (const c of balanceChangesHistory) {
      map[c.id] = (map[c.id] || 0) + c.amount
    }
    return map
  }, [balanceChangesHistory])

  const refreshDungeon = useCallback(async () => {
    if (!bearerToken) return
    await callGigaverseAction(fetchDungeonStateAction, bearerToken)
  }, [bearerToken])

  const checkRunOverAndRefresh = useCallback(async (): Promise<boolean> => {
    const ds = useGigaverseStore.getState().dungeonState
    if (!ds || !ds.run) {
      setAutoPlay(false)
      await refreshDungeon()
      return true
    }
    const ended = ds.run.players[0].health?.current <= 0 || !!ds.entity?.COMPLETE_CID
    if (ended) {
      setAutoPlay(false)
      const roomNum = ds.entity?.ROOM_NUM_CID ?? 1
      const finalEnemies = Math.max(0, roomNum - 1)
      setFinalEnemiesDefeated(finalEnemies)

      const itemChanges = getAggregatedItemChanges()
      addRun({
        address: address!,
        username: username!,
        noobId: noobId!,
        dungeonId: ds.entity?.ID_CID ? Number(ds.entity.ID_CID) : 0,
        dungeonName: currentDungeonNameRef.current,
        isJuiced: currentDungeonIsJuicedRef.current,
        enemiesDefeated: finalEnemies,
        timestamp: Date.now(),
        itemChanges,
        algorithmUsed: selectedAlgorithm,
      })
      await refreshDungeon()
      return true
    }
    return false
  }, [
    address,
    username,
    noobId,
    getAggregatedItemChanges,
    refreshDungeon,
    setAutoPlay,
    addRun,
    selectedAlgorithm,
  ])

  // getRecommendedMove: read store once to avoid race conditions
  const getRecommendedMove = useCallback((): GigaverseActionType | null => {
    const storeState = useGigaverseStore.getState()
    const ds = storeState.dungeonState
    if (!ds?.run) return null
    if (selectedAlgorithm === 'manual') return null

    // Random mode
    if (selectedAlgorithm === 'random') {
      const possible: GigaverseActionType[] = []
      if (ds.run?.lootPhase && ds.run.lootOptions?.length) {
        const lootActions = [
          GigaverseActionType.PICK_LOOT_ONE,
          GigaverseActionType.PICK_LOOT_TWO,
          GigaverseActionType.PICK_LOOT_THREE,
          GigaverseActionType.PICK_LOOT_FOUR,
        ]
        for (let i = 0; i < Math.min(ds.run.lootOptions.length, lootActions.length); i++) {
          possible.push(lootActions[i])
        }
      } else {
        possible.push(
          GigaverseActionType.MOVE_ROCK,
          GigaverseActionType.MOVE_PAPER,
          GigaverseActionType.MOVE_SCISSOR
        )
      }
      return possible[Math.floor(Math.random() * possible.length)]
    }

    // Build engine-friendly state
    const actionData = buildGigaverseRunState(ds, useGameDataStore.getState().enemies)

    // MCTS
    if (selectedAlgorithm === 'mcts' && algoRefs.current.mcts) {
      return algoRefs.current.mcts.pickAction(actionData).type
    }

    // Minimax
    if (selectedAlgorithm === 'minimax' && algoRefs.current.minimax) {
      return algoRefs.current.minimax.pickAction(actionData).type
    }

    // DP
    if (selectedAlgorithm === 'dp' && algoRefs.current.dp) {
      return algoRefs.current.dp.pickAction(actionData).type
    }

    // Greedy
    if (selectedAlgorithm === 'greedy' && algoRefs.current.greedy) {
      return algoRefs.current.greedy.pickAction(actionData).type
    }

    return null
  }, [selectedAlgorithm])

  const handlePlayMove = useCallback(
    async (move: GigaverseActionType) => {
      if (!bearerToken) return
      const prevDs = useGigaverseStore.getState().dungeonState
      if (!prevDs?.run) return

      try {
        const result = await callGigaverseAction(
          playMoveAction,
          bearerToken,
          useGigaverseStore.getState().actionToken,
          Number(prevDs.entity?.ID_CID),
          move
        )
        if (result.gameItemBalanceChanges?.length) {
          setBalanceChangesHistory((prev) => [...prev, ...result.gameItemBalanceChanges!])
        }
      } catch (err) {
        console.error('[Dashboard] handlePlayMove error:', err)
      }
    },
    [bearerToken]
  )

  // runAutoPlayChain: safer loop with explicit step cap and improved break conditions
  const runAutoPlayChain = useCallback(async () => {
    if (isAutoPlayingRef.current) return
    isAutoPlayingRef.current = true

    try {
      let steps = 600
      while (autoPlayRef.current && steps > 0) {
        // If run ended or no run present, refresh and break
        if (await checkRunOverAndRefresh()) break

        const move = getRecommendedMove()
        if (!move) {
          // No move available — break out (maybe manual or inconsistent state)
          break
        }

        await handlePlayMove(move)

        // Short delay only in dev to ease debugging; in prod we proceed as fast as API allows.
        if (process.env.NODE_ENV === 'development') {
          await new Promise((res) => setTimeout(res, 40))
        }

        steps--
      }
      // Final consistency check
      await checkRunOverAndRefresh()
    } catch (error) {
      console.error('[runAutoPlayChain] error:', error)
    } finally {
      isAutoPlayingRef.current = false
    }
  }, [checkRunOverAndRefresh, getRecommendedMove, handlePlayMove])

  useEffect(() => {
    if (autoPlay && !isAutoPlayingRef.current) {
      runAutoPlayChain()
    }
  }, [autoPlay, runAutoPlayChain])

  async function handleStartRun(dungeonId: number, isJuiced: boolean) {
    if (!bearerToken) return
    setLocalError('')
    try {
      const { actionToken } = useGigaverseStore.getState()
      const result = await callGigaverseAction(
        startRunAction,
        bearerToken,
        actionToken || '',
        dungeonId,
        isJuiced
      )
      if (!result.success) {
        setLocalError(result.message || 'Failed to start run.')
        return
      }
      setBalanceChangesHistory([])
      setFinalEnemiesDefeated(0)

      const dsName = todayDungeonsMap[dungeonId]?.NAME_CID ?? `Dungeon #${dungeonId}`
      setCurrentDungeonName(dsName)
      setCurrentDungeonIsJuiced(isJuiced)
      currentDungeonNameRef.current = dsName
      currentDungeonIsJuicedRef.current = isJuiced

      incrementRunCount(dungeonId, isJuiced ? 3 : 1)
      await loadEnergy(bearerToken)
    } catch (err) {
      console.error('[Dashboard] handleStartRun error:', err)
      setLocalError(err instanceof Error ? err.message : 'Unknown error starting run.')
    }
  }

  async function refreshAll() {
    if (!bearerToken) return
    setLocalError('')
    try {
      await Promise.all([
        loadEnergy(bearerToken),
        callGigaverseAction(fetchDungeonStateAction, bearerToken),
        loadDayProgress(bearerToken),
        loadTodayDungeonData(bearerToken),
      ])
    } catch (err) {
      console.error('[Dashboard] refreshAll error:', err)
      setLocalError('Failed to refresh all data.')
    }
  }

  let currentEnergyInt = 0
  let isPlayerJuiced = false
  if (energyData) {
    currentEnergyInt = Math.floor(energyData.energy / 1_000_000_000)
    isPlayerJuiced = energyData.isPlayerJuiced
  }

  return (
    <div className="space-y-6">
      <DashboardHeader />

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <EnergyDisplay energyData={energyData} />
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-border bg-card">
          <p className="text-muted-foreground">Loading data from server...</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      ) : (
        <>
          {localError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              {localError}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* Left column: Algorithm + Active run or dungeon list */}
            <div className="space-y-6">
              <AlgorithmSelector />

              {dungeonState?.run ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold">Active Run</h2>
                    {selectedAlgorithm !== 'manual' && (
                      <Button
                        variant={autoPlay ? 'destructive' : 'default'}
                        size="sm"
                        onClick={() => setAutoPlay(!autoPlay)}
                        className="w-full sm:w-auto"
                      >
                        {autoPlay ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause Auto-Play
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Start Auto-Play
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <ActiveRunPanel
                    dungeonState={dungeonState}
                    onPlayMove={handlePlayMove}
                    recommendedMove={getRecommendedMove()}
                  />
                </div>
              ) : (
                <DungeonList
                  dungeons={todayDungeonsMap}
                  dayProgressMap={dayProgressMap}
                  currentEnergy={currentEnergyInt}
                  isPlayerJuiced={isPlayerJuiced}
                  onStartRun={handleStartRun}
                />
              )}
            </div>

            {/* Right column: Recap, ROM manager, Run history */}
            <div className="space-y-6">
              <RunRecapPanel
                changes={balanceChangesHistory}
                dungeonState={dungeonState}
                finalEnemiesDefeated={finalEnemiesDefeated}
              />
              <RomManagerPanel />
              <RunTabsPanel />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
