import { useState, useCallback, useRef, useEffect } from 'react'
import Map, { MapRef, Marker, Source, Layer } from 'react-map-gl/maplibre'
import { GeoRoutesClient, CalculateRoutesCommand, OptimizeWaypointsCommand } from '@aws-sdk/client-geo-routes'
import { withAPIKey } from '@aws/amazon-location-utilities-auth-helper'
import 'maplibre-gl/dist/maplibre-gl.css'

// 配置 - 从环境变量读取
const AWS_API_KEY = import.meta.env.VITE_AWS_API_KEYS
const AWS_REGION = import.meta.env.VITE_AWS_API_KEY_REGIONS || 'us-east-1'
const MAP_CENTER_LNG = Number(import.meta.env.VITE_MAP_CENTER_LONGITUDE) || -74.006
const MAP_CENTER_LAT = Number(import.meta.env.VITE_MAP_CENTER_LATITUDE) || 40.7128
const MAP_INITIAL_ZOOM = Number(import.meta.env.VITE_MAP_INITIAL_ZOOM) || 12

interface DeliveryPoint {
  id: string
  coordinates: [number, number]
  address: string
}

interface RouteSegment {
  startPoint: [number, number]
  endPoint: [number, number]
  duration: number
  midPoint: [number, number]
}

interface OptimizedRoute {
  sequence: number[]
  totalDistance: number
  totalTime: number
  routeGeometry: any
  segments: RouteSegment[]
  algorithmName: string
}

type ClickMode = 'none' | 'depot' | 'delivery'

function App() {
  const mapRef = useRef<MapRef>(null)
  const [depot, setDepot] = useState<DeliveryPoint | null>(null)
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([])
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [clickMode, setClickMode] = useState<ClickMode>('none')
  const [vehicleType, setVehicleType] = useState('Truck')
  const [routesClient, setRoutesClient] = useState<GeoRoutesClient | null>(null)
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualCoords, setManualCoords] = useState('')
  const [language, setLanguage] = useState<'en' | 'zh'>('en')
  const [deliveryTimeMinutes, setDeliveryTimeMinutes] = useState(5)
  const [useTraffic, setUseTraffic] = useState(true)
  const [departureTime, setDepartureTime] = useState('')

  // 翻译对象
  const t = {
    en: {
      title: 'Delivery Route Optimization',
      vehicleType: 'Vehicle Type',
      depot: 'Depot',
      setDepot: 'Set Depot',
      deliveryPoints: 'Delivery Points',
      pointsList: 'Points List',
      nearestNeighbor: 'Nearest Neighbor',
      awsOptimization: 'AWS Optimization',
      clearAll: 'Clear All',
      optimizing: 'Optimizing...',
      result: 'Optimization Result',
      totalDistance: 'Total Distance',
      estimatedTime: 'Estimated Time',
      route: 'Route',
      depot_: 'Depot',
      point: 'Point',
      roadPath: '✓ Real road path displayed',
      timeMarkers: '✓ Time markers displayed',
      mapAdd: 'Map Add',
      manualInput: 'Manual Input',
      addCoords: 'Add Coords',
      cancel: 'Cancel',
      delete: 'Delete',
      coordPlaceholder: 'Enter coordinates, one per line, format: longitude,latitude\nExample:\n44.3661, 33.3152\n44.3700, 33.3200',
      nearestAlgorithm: 'Nearest Neighbor Algorithm',
      awsAlgorithm: 'AWS Official Optimization',
      minutes: 'min',
      deliveryTime: 'Delivery Time',
      trafficMode: 'Traffic Mode',
      departureTime: 'Departure Time'
    },
    zh: {
      title: '快递路径规划',
      vehicleType: '车辆类型',
      depot: '配送中心',
      setDepot: '设置配送中心',
      deliveryPoints: '配送点',
      pointsList: '配送点列表',
      nearestNeighbor: '最近邻算法优化',
      awsOptimization: 'AWS 官方优化',
      clearAll: '清除全部',
      optimizing: '优化中...',
      result: '优化结果',
      totalDistance: '总距离',
      estimatedTime: '预计时间',
      route: '配送顺序',
      depot_: '配送中心',
      point: '配送点',
      roadPath: '✓ 已显示实际道路路径',
      timeMarkers: '✓ 已显示路段时间标记',
      mapAdd: '地图添加',
      manualInput: '手动输入',
      addCoords: '添加坐标',
      cancel: '取消',
      delete: '删除',
      coordPlaceholder: '输入经纬度，一行一个，格式：经度,纬度\n例如：\n44.3661, 33.3152\n44.3700, 33.3200',
      nearestAlgorithm: '最近邻算法',
      awsAlgorithm: 'AWS 官方优化',
      minutes: '分钟',
      deliveryTime: '投递时间',
      trafficMode: '交通模式',
      departureTime: '出发时间'
    }
  }

  // 初始化 AWS Routes 客户端
  useEffect(() => {
    const initClient = async () => {
      try {
        const authHelper = await withAPIKey(AWS_API_KEY)
        const locationClientConfig = authHelper.getLocationClientConfig()
        const client = new GeoRoutesClient({ ...locationClientConfig, region: AWS_REGION })
        setRoutesClient(client)
      } catch (error) {
        console.error('初始化 AWS 客户端失败:', error)
      }
    }
    
    if (AWS_API_KEY) {
      initClient()
    }
  }, [])

  // 生成交通参数
  const getTrafficParams = useCallback(() => {
    if (!useTraffic) return {}
    
    if (departureTime) {
      // 使用未来时间预测交通
      return { DepartureTime: new Date(departureTime).toISOString() }
    } else {
      // 使用当前实时交通
      return { DepartNow: true }
    }
  }, [useTraffic, departureTime])

  // 地图点击处理
  const handleMapClick = useCallback((event: any) => {
    const { lng, lat } = event.lngLat
    const coordinates: [number, number] = [lng, lat]

    if (clickMode === 'depot') {
      setDepot({
        id: 'depot',
        coordinates,
        address: `${t[language].depot_} (${lng.toFixed(4)}, ${lat.toFixed(4)})`
      })
      setClickMode('none')
    } else if (clickMode === 'delivery') {
      const newPoint: DeliveryPoint = {
        id: Date.now().toString(),
        coordinates,
        address: `${deliveryPoints.length + 1}. (${lng.toFixed(4)}, ${lat.toFixed(4)})`
      }
      setDeliveryPoints(prev => [...prev, newPoint])
    }
  }, [clickMode, deliveryPoints.length])

  // 计算两点间距离
  const calculateDistance = (point1: [number, number], point2: [number, number]) => {
    const [lon1, lat1] = point1
    const [lon2, lat2] = point2
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // 路径优化算法
  const optimizeRoute = useCallback(async () => {
    if (!depot || deliveryPoints.length < 2 || !routesClient) return

    setClickMode('none') // 自动停止添加配送点
    setIsOptimizing(true)

    try {
      const points = [depot, ...deliveryPoints]
      const visited = new Set<number>()
      const sequence: number[] = [0]
      visited.add(0)

      let currentIndex = 0
      const allCoordinates = [depot.coordinates]
      const segments: RouteSegment[] = []
      let totalDistance = 0
      let totalTime = 0

      // 最近邻算法
      while (visited.size < points.length) {
        let nearestIndex = -1
        let nearestDistance = Infinity

        for (let i = 1; i < points.length; i++) {
          if (!visited.has(i)) {
            const distance = calculateDistance(points[currentIndex].coordinates, points[i].coordinates)
            if (distance < nearestDistance) {
              nearestDistance = distance
              nearestIndex = i
            }
          }
        }

        if (nearestIndex !== -1) {
          sequence.push(nearestIndex)
          visited.add(nearestIndex)

          try {
            const command = new CalculateRoutesCommand({
              Origin: points[currentIndex].coordinates,
              Destination: points[nearestIndex].coordinates,
              TravelMode: vehicleType,
              IncludeLegGeometry: true,
              LegGeometryFormat: 'Simple',
              LegAdditionalFeatures: ['Summary'],
              ...getTrafficParams()
            })

            const routeResult = await routesClient.send(command)

            if (routeResult?.Routes?.[0]?.Legs?.[0]?.Geometry?.LineString) {
              const coords = routeResult.Routes[0].Legs[0].Geometry.LineString
              const segmentDuration = (routeResult.Routes[0].Summary?.Duration ?? 0) + (deliveryTimeMinutes * 60) // 添加投递时间

              const startCoord = points[currentIndex].coordinates
              const endCoord = points[nearestIndex].coordinates
              const midPoint: [number, number] = [
                (startCoord[0] + endCoord[0]) / 2,
                (startCoord[1] + endCoord[1]) / 2
              ]

              segments.push({
                startPoint: startCoord,
                endPoint: endCoord,
                duration: segmentDuration,
                midPoint
              })

              allCoordinates.push(...coords.slice(1))
              totalDistance += routeResult.Routes[0].Summary?.Distance ?? 0
              totalTime += segmentDuration
            } else {
              allCoordinates.push(points[nearestIndex].coordinates)
              totalDistance += nearestDistance * 1000
              totalTime += nearestDistance * 120
            }
          } catch (error) {
            console.error('路径计算失败:', error)
            allCoordinates.push(points[nearestIndex].coordinates)
            totalDistance += nearestDistance * 1000
            totalTime += nearestDistance * 120
          }

          currentIndex = nearestIndex
        }
      }

      // 返回起点
      sequence.push(0)
      try {
        const command = new CalculateRoutesCommand({
          Origin: points[currentIndex].coordinates,
          Destination: depot.coordinates,
          TravelMode: vehicleType,
          IncludeLegGeometry: true,
          LegGeometryFormat: 'Simple',
          LegAdditionalFeatures: ['Summary'],
          ...getTrafficParams()
        })

        const returnRoute = await routesClient.send(command)

        if (returnRoute?.Routes?.[0]?.Legs?.[0]?.Geometry?.LineString) {
          const coords = returnRoute.Routes[0].Legs[0].Geometry.LineString
          const returnDuration = returnRoute.Routes[0].Summary?.Duration ?? 0

          const startCoord = points[currentIndex].coordinates
          const endCoord = depot.coordinates
          const midPoint: [number, number] = [
            (startCoord[0] + endCoord[0]) / 2,
            (startCoord[1] + endCoord[1]) / 2
          ]

          segments.push({
            startPoint: startCoord,
            endPoint: endCoord,
            duration: returnDuration,
            midPoint
          })

          allCoordinates.push(...coords.slice(1))
          totalDistance += returnRoute.Routes[0].Summary?.Distance ?? 0
          totalTime += returnRoute.Routes[0].Summary?.Duration ?? 0
        }
      } catch (error) {
        console.error('返程路径计算失败:', error)
        allCoordinates.push(depot.coordinates)
      }

      const routeGeometry = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: allCoordinates
        }
      }

      setOptimizedRoute({
        sequence,
        totalDistance: totalDistance / 1000,
        totalTime: totalTime / 60,
        routeGeometry,
        segments,
        algorithmName: t[language].nearestAlgorithm
      })
    } catch (error) {
      console.error('路径优化失败:', error)
    } finally {
      setIsOptimizing(false)
    }
  }, [depot, deliveryPoints, vehicleType, routesClient, getTrafficParams, deliveryTimeMinutes, language, t])

  // AWS 官方路径优化
  const optimizeWithAWS = useCallback(async () => {
    if (!depot || deliveryPoints.length < 2 || !routesClient) return

    setClickMode('none') // 自动停止添加配送点
    setIsOptimizing(true)

    try {
      const waypoints = deliveryPoints.map((point, index) => ({
        Position: point.coordinates,
        Id: index
      }))

      const command = new OptimizeWaypointsCommand({
        Origin: depot.coordinates,
        Destination: depot.coordinates,
        Waypoints: waypoints,
        TravelMode: vehicleType,
        ...getTrafficParams()
      })

      const optimizeResult = await routesClient.send(command)

      if (optimizeResult?.OptimizedWaypoints) {
        const optimizedSequence = [0]
        const allCoordinates = [depot.coordinates]
        const segments: RouteSegment[] = []
        let totalDistance = 0
        let totalTime = 0

        // 按优化后的顺序计算路径
        for (const waypoint of optimizeResult.OptimizedWaypoints) {
          const originalIndex = deliveryPoints.findIndex(point => 
            Math.abs(point.coordinates[0] - waypoint.Position[0]) < 0.0001 &&
            Math.abs(point.coordinates[1] - waypoint.Position[1]) < 0.0001
          )
          const waypointIndex = originalIndex + 1
          optimizedSequence.push(waypointIndex)
          
          const routeCommand = new CalculateRoutesCommand({
            Origin: allCoordinates[allCoordinates.length - 1],
            Destination: waypoint.Position,
            TravelMode: vehicleType,
            IncludeLegGeometry: true,
            LegGeometryFormat: 'Simple',
            LegAdditionalFeatures: ['Summary'],
            ...getTrafficParams()
          })

          const routeResult = await routesClient.send(routeCommand)

          if (routeResult?.Routes?.[0]?.Legs?.[0]?.Geometry?.LineString) {
            const coords = routeResult.Routes[0].Legs[0].Geometry.LineString
            const segmentDuration = (routeResult.Routes[0].Summary?.Duration ?? 0) + (deliveryTimeMinutes * 60)
            
            const startCoord = allCoordinates[allCoordinates.length - 1]
            const endCoord = waypoint.Position
            const midPoint: [number, number] = [
              (startCoord[0] + endCoord[0]) / 2,
              (startCoord[1] + endCoord[1]) / 2
            ]
            
            segments.push({
              startPoint: startCoord,
              endPoint: endCoord,
              duration: segmentDuration,
              midPoint
            })
            
            allCoordinates.push(...coords.slice(1))
            totalDistance += routeResult.Routes[0].Summary?.Distance ?? 0
            totalTime += segmentDuration
          } else {
            allCoordinates.push(waypoint.Position)
          }
        }

        // 返回起点
        optimizedSequence.push(0)
        const returnCommand = new CalculateRoutesCommand({
          Origin: allCoordinates[allCoordinates.length - 1],
          Destination: depot.coordinates,
          TravelMode: vehicleType,
          IncludeLegGeometry: true,
          LegGeometryFormat: 'Simple',
          LegAdditionalFeatures: ['Summary']
        })

        const returnRoute = await routesClient.send(returnCommand)

        if (returnRoute?.Routes?.[0]?.Legs?.[0]?.Geometry?.LineString) {
          const coords = returnRoute.Routes[0].Legs[0].Geometry.LineString
          const returnDuration = returnRoute.Routes[0].Summary?.Duration ?? 0
          
          const startCoord = allCoordinates[allCoordinates.length - 1]
          const endCoord = depot.coordinates
          const midPoint: [number, number] = [
            (startCoord[0] + endCoord[0]) / 2,
            (startCoord[1] + endCoord[1]) / 2
          ]
          
          segments.push({
            startPoint: startCoord,
            endPoint: endCoord,
            duration: returnDuration,
            midPoint
          })
          
          allCoordinates.push(...coords.slice(1))
          totalDistance += returnRoute.Routes[0].Summary?.Distance ?? 0
          totalTime += returnRoute.Routes[0].Summary?.Duration ?? 0
        }

        const routeGeometry = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: allCoordinates
          }
        }

        setOptimizedRoute({
          sequence: optimizedSequence,
          totalDistance: totalDistance / 1000,
          totalTime: totalTime / 60,
          routeGeometry,
          segments,
          algorithmName: t[language].awsAlgorithm
        })
      }
    } catch (error) {
      console.error('AWS 路径优化失败:', error)
    } finally {
      setIsOptimizing(false)
    }
  }, [depot, deliveryPoints, vehicleType, routesClient, getTrafficParams, deliveryTimeMinutes, language, t])

  const clearAll = useCallback(() => {
    setDeliveryPoints([])
    setDepot(null)
    setOptimizedRoute(null)
    setClickMode('none')
  }, [])

  const removeDeliveryPoint = useCallback((id: string) => {
    setDeliveryPoints(prev => prev.filter(point => point.id !== id))
  }, [])

  // 处理手动输入的经纬度
  const handleManualInput = useCallback(() => {
    const lines = manualCoords.trim().split('\n')
    const newPoints: DeliveryPoint[] = []
    
    lines.forEach((line, index) => {
      const coords = line.trim().split(/[,\s]+/)
      if (coords.length >= 2) {
        const lng = parseFloat(coords[0])
        const lat = parseFloat(coords[1])
        if (!isNaN(lng) && !isNaN(lat)) {
          newPoints.push({
            id: Date.now().toString() + index,
            coordinates: [lng, lat],
            address: `${deliveryPoints.length + newPoints.length + 1}. (${lng.toFixed(4)}, ${lat.toFixed(4)})`
          })
        }
      }
    })
    
    if (newPoints.length > 0) {
      setDeliveryPoints(prev => [...prev, ...newPoints])
      setManualCoords('')
      setShowManualInput(false)
    }
  }, [manualCoords, deliveryPoints.length])

  // 格式化地址显示
  const formatAddress = useCallback((point: DeliveryPoint, index?: number) => {
    if (point.id === 'depot') {
      return `${t[language].depot_} (${point.coordinates[0].toFixed(4)}, ${point.coordinates[1].toFixed(4)})`
    } else {
      const pointIndex = index !== undefined ? index + 1 : parseInt(point.address.split('.')[0]) || 1
      return `${pointIndex}. (${point.coordinates[0].toFixed(4)}, ${point.coordinates[1].toFixed(4)})`
    }
  }, [language, t])

  const routeLayerStyle = {
    id: 'route',
    type: 'line' as const,
    paint: {
      'line-color': '#3b82f6',
      'line-width': 4,
      'line-opacity': 0.8
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: MAP_CENTER_LNG,
          latitude: MAP_CENTER_LAT,
          zoom: MAP_INITIAL_ZOOM
        }}
        style={{ width: '100%', height: '100vh' }}
        mapStyle={`https://maps.geo.${AWS_REGION}.amazonaws.com/v2/styles/Standard/descriptor?key=${AWS_API_KEY}`}
        onClick={handleMapClick}
        cursor={clickMode !== 'none' ? 'crosshair' : 'default'}
      >
        {optimizedRoute?.routeGeometry && (
          <Source id="route" type="geojson" data={optimizedRoute.routeGeometry}>
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {depot && (
          <Marker longitude={depot.coordinates[0]} latitude={depot.coordinates[1]} anchor="bottom">
            <div className="marker depot-marker">🚛</div>
          </Marker>
        )}

        {deliveryPoints.map((point, index) => (
          <Marker key={point.id} longitude={point.coordinates[0]} latitude={point.coordinates[1]} anchor="bottom">
            <div className="marker delivery-marker">{index + 1}</div>
          </Marker>
        ))}

        {optimizedRoute?.segments?.map((segment, index) => (
          <Marker 
            key={`segment-${index}`} 
            longitude={segment.midPoint[0]} 
            latitude={segment.midPoint[1]} 
            anchor="center"
          >
            <div className="segment-time">
              {Math.round(segment.duration / 60)}{t[language].minutes}
            </div>
          </Marker>
        ))}
      </Map>

      <div className="control-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', margin: 0 }}>{t[language].title}</h2>
          <button 
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            style={{ padding: '4px 8px', fontSize: '16px' }}
            title={language === 'en' ? '切换到中文' : 'Switch to English'}
          >
            {language === 'en' ? '🇨🇳' : '🇺🇸'}
          </button>
        </div>
        
        <div className="section">
          <h3>{t[language].vehicleType}</h3>
          <div className="button-group">
            {[
              { type: 'Truck', icon: '🚛', name: '卡车' },
              { type: 'Car', icon: '🚗', name: '汽车' },
              { type: 'Scooter', icon: '🛵', name: '电动车' },
              { type: 'Pedestrian', icon: '🚶', name: '步行' }
            ].map(({ type, icon, name }) => (
              <button
                key={type}
                className={vehicleType === type ? 'primary' : ''}
                onClick={() => setVehicleType(type)}
                title={name}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>{t[language].deliveryTime}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min="1"
              max="15"
              value={deliveryTimeMinutes}
              onChange={(e) => setDeliveryTimeMinutes(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '14px', minWidth: '60px' }}>
              {deliveryTimeMinutes} {t[language].minutes}
            </span>
          </div>
        </div>

        <div className="section">
          <h3>{t[language].trafficMode}</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={useTraffic}
              onChange={(e) => setUseTraffic(e.target.checked)}
            />
            {language === 'en' ? 'Use traffic information' : '使用交通信息'}
          </label>
          
          {useTraffic && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                {t[language].departureTime} ({language === 'en' ? 'optional' : '可选'}):
              </label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                min={new Date().toISOString().slice(0, 16)}
              />
              <div style={{ fontSize: '11px', color: 'gray', marginTop: '2px' }}>
                {language === 'en' 
                  ? 'Leave empty for real-time traffic' 
                  : '留空使用实时交通信息'}
              </div>
            </div>
          )}
        </div>

        <div className="section">
          <h3>{t[language].depot}</h3>
          {!depot ? (
            <button
              className={clickMode === 'depot' ? 'primary' : ''}
              onClick={() => setClickMode('depot')}
            >
              {clickMode === 'depot' ? '📍...' : t[language].setDepot}
            </button>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'green' }}>✓ {formatAddress(depot)}</span>
              <button onClick={() => setDepot(null)} title={t[language].delete}>🗑️</button>
            </div>
          )}
        </div>

        <div className="section">
          <h3>{t[language].deliveryPoints}</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              className={clickMode === 'delivery' ? 'primary' : ''}
              onClick={() => setClickMode('delivery')}
              style={{ flex: 1 }}
              title={t[language].mapAdd}
            >
              📍
            </button>
            <button
              onClick={() => setShowManualInput(!showManualInput)}
              style={{ flex: 1 }}
              title={t[language].manualInput}
            >
              ⌨️
            </button>
          </div>
          
          {showManualInput && (
            <div style={{ marginBottom: '8px' }}>
              <textarea
                value={manualCoords}
                onChange={(e) => setManualCoords(e.target.value)}
                placeholder={t[language].coordPlaceholder}
                rows={4}
                style={{ width: '100%', padding: '8px', fontSize: '12px', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={handleManualInput} className="primary" style={{ flex: 1 }} title={t[language].addCoords}>
                  ✅
                </button>
                <button onClick={() => { setManualCoords(''); setShowManualInput(false) }} style={{ flex: 1 }} title={t[language].cancel}>
                  ❌
                </button>
              </div>
            </div>
          )}
        </div>

        {deliveryPoints.length > 0 && (
          <div className="section">
            <h3>{t[language].pointsList} ({deliveryPoints.length})</h3>
            {deliveryPoints.map((point, index) => (
              <div key={point.id} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '4px 0',
                fontSize: '13px'
              }}>
                <span>{formatAddress(point, index)}</span>
                <button onClick={() => removeDeliveryPoint(point.id)} title={t[language].delete}>🗑️</button>
              </div>
            ))}
          </div>
        )}

        <div className="section">
          <button
            onClick={optimizeRoute}
            disabled={!depot || deliveryPoints.length < 2 || isOptimizing}
            className="primary"
            style={{ width: '100%', marginBottom: '8px' }}
          >
            {isOptimizing ? t[language].optimizing : t[language].nearestNeighbor}
          </button>
          <button
            onClick={optimizeWithAWS}
            disabled={!depot || deliveryPoints.length < 2 || isOptimizing}
            className="primary"
            style={{ width: '100%', marginBottom: '8px' }}
          >
            {isOptimizing ? t[language].optimizing : t[language].awsOptimization}
          </button>
          <button onClick={clearAll} style={{ width: '100%' }}>
            {t[language].clearAll}
          </button>
        </div>

        {optimizedRoute && (
          <div className="result-card">
            <h4>{t[language].result} - {optimizedRoute.algorithmName}</h4>
            <p>{t[language].totalDistance}: {optimizedRoute.totalDistance.toFixed(2)} km</p>
            <p>{t[language].estimatedTime}: {optimizedRoute.totalTime.toFixed(0)} {language === 'en' ? 'minutes' : '分钟'}</p>
            <p>{t[language].route}: {optimizedRoute.sequence
              .filter((item, index, arr) => !(item === 0 && (index === 0 || index === arr.length - 1) && arr.filter(x => x === 0).length > 2))
              .map(i => (i === 0 ? t[language].depot_ : `${t[language].point} ${i}`))
              .join(' → ')}</p>
            <p style={{ color: 'blue', fontSize: '12px' }}>{t[language].roadPath}</p>
            <p style={{ color: 'green', fontSize: '12px' }}>{t[language].timeMarkers}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
