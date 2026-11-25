import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Focus,
  Minus,
  Plus,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Moon,
  Pause,
  Play,
  X,
  Network,
} from "lucide-react";
import { ContactFilters, emptyContactFilters } from "./ContactFilters";
import { contactMatches, type InitiativeData } from "./workspace";
import { selectGraph, type MapFilters } from "./graph";
import {
  nodeColor,
  type ColorMode,
  type PositionCache,
  type SceneControls,
} from "./forceGraph";
import ForceScene2D from "./ForceScene2D";
const ForceScene3D = lazy(() => import("./ForceScene3D"));
const emptyFilters: MapFilters = {
  role: "",
  department: "",
  search: "",
  focus: null,
  depth: 1,
};

class SceneBoundary extends Component<
  { children: ReactNode; fallback: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="graph-unavailable" role="alert">
        <h3>3D не удалось открыть</h3>
        <p>
          В этом браузере недоступна 3D-графика. Карта работает в режиме 2D.
        </p>
        <button className="secondary" onClick={this.props.fallback}>
          Открыть 2D
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export function InfluenceMap({
  item,
  selectedId,
  onSelect,
}: {
  item: InitiativeData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filters, setFilters] = useState(emptyFilters),
    [smart, setSmart] = useState(emptyContactFilters);
  const [mode, setMode] = useState<"2d" | "3d">("2d"),
    [dark, setDark] = useState(false),
    [colorMode, setColorMode] = useState<ColorMode>("role");
  const [showFilters, setShowFilters] = useState(false),
    [labels, setLabels] = useState(true);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hoveredId, setHovered] = useState<string | null>(null),
    [edgeId, setEdge] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false),
    [size, setSize] = useState({ width: 600, height: 500 });
  const stage = useRef<HTMLDivElement>(null),
    controls = useRef<SceneControls | null>(null);
  const positions2D = useRef<PositionCache>(new Map()),
    positions3D = useRef<PositionCache>(new Map());
  const graph = item.graph;
  const visible = useMemo(() => {
    const selection = selectGraph(graph, filters);
    const nodes = selection.nodes.filter((person) =>
      contactMatches(person, item, smart),
    );
    const ids = new Set(nodes.map((person) => person.id));
    return {
      nodes,
      edges: selection.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    };
  }, [graph, filters, smart, item]);
  const departments = useMemo(
    () => graph.filters.departments.map((department) => department.id).sort(),
    [graph],
  );
  const color = useMemo(
    () => (node: (typeof graph.nodes)[number]) =>
      nodeColor(node, colorMode, departments),
    [colorMode, departments],
  );
  const focus = graph.nodes.find((person) => person.id === filters.focus),
    hovered = visible.nodes.find((person) => person.id === hoveredId);
  const selectedEdge = visible.edges.find((edge) => edge.id === edgeId);
  const filterCount = Object.values(smart).filter(Boolean).length;
  const names = new Map(graph.nodes.map((node) => [node.id, node.name]));
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0)
        setSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible.nodes.length > 0]);
  function select(id: string) {
    setHovered(null);
    onSelect(id);
  }
  const sceneProps = {
    ...visible,
    ...size,
    dark,
    labels,
    paused,
    selectedId,
    hoveredId,
    color,
    controls,
    positions: mode === "2d" ? positions2D.current : positions3D.current,
    onSelect: (id: string) => {
      stage.current?.focus({ preventScroll: true });
      select(id);
    },
    onLink: (id: string) => {
      setEdge(id);
      setHovered(null);
      setConnectionsOpen(true);
    },
    onHover: setHovered,
  };
  return (
    <section
      className={
        "surface influence-map force-map" + (dark ? " graph-dark" : "")
      }
      aria-labelledby="map-heading"
    >
      <div className="surface-head">
        <div>
          <h2 id="map-heading">
            Карта связей <span>{visible.nodes.length} участников</span>
          </h2>
          <p>Перемещайте узлы. Нажмите на сотрудника, чтобы открыть профиль.</p>
        </div>
        <div className="graph-head-actions">
          <button
            className="secondary"
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={15} />
            Фильтры{filterCount ? ` · ${filterCount}` : ""}
          </button>
          <button
            className="secondary"
            type="button"
            disabled={!selectedId && !filters.focus}
            aria-pressed={!!filters.focus}
            onClick={() => {
              setFilters(
                filters.focus
                  ? emptyFilters
                  : { ...emptyFilters, focus: selectedId },
              );
              setSmart(emptyContactFilters);
              setEdge(null);
            }}
          >
            <Focus size={15} />
            {filters.focus ? "Вся карта" : "Окружение выбранного"}
          </button>
        </div>
      </div>
      {showFilters && (
        <ContactFilters
          item={item}
          value={smart}
          change={(value) => {
            setSmart(value);
            setEdge(null);
          }}
        />
      )}
      <div className="graph-toolbar">
        <div className="graph-mode" role="group" aria-label="Режим карты">
          <button
            aria-pressed={mode === "2d"}
            onClick={() => {
              setMode("2d");
              setHovered(null);
            }}
          >
            2D
          </button>
          <button
            aria-pressed={mode === "3d"}
            onClick={() => {
              setMode("3d");
              setHovered(null);
            }}
          >
            3D
          </button>
        </div>
        <label className="graph-color-control">
          Цвет узлов
          <select
            aria-label="Цвет узлов"
            value={colorMode}
            onChange={(event) => setColorMode(event.target.value as ColorMode)}
          >
            <option value="role">По роли</option>
            <option value="department">По отделу</option>
          </select>
        </label>
        {focus && (
          <label className="graph-depth-control">
            Окружение
            <select
              aria-label="Глубина окружения"
              value={filters.depth ?? 1}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  depth: Number(event.target.value) as 1 | 2,
                })
              }
            >
              <option value={1}>Один шаг</option>
              <option value={2}>Два шага</option>
            </select>
          </label>
        )}
        <span className="graph-count" role="status">
          {focus ? `Окружение: ${focus.name} · ` : ""}
          {visible.nodes.length} из {graph.nodes.length} · связей{" "}
          {visible.edges.length}
        </span>
        {(filterCount > 0 || filters.focus) && (
          <button
            className="text-button"
            onClick={() => {
              setSmart(emptyContactFilters);
              setFilters(emptyFilters);
              setEdge(null);
            }}
          >
            Сбросить
          </button>
        )}
      </div>
      {visible.nodes.length ? (
        <div className="graph-workspace">
          <div
            className="force-stage"
            ref={stage}
            tabIndex={0}
            role="region"
            aria-label="Интерактивный граф сотрудников"
            aria-describedby="graph-instructions"
          >
            {mode === "2d" ? (
              <ForceScene2D {...sceneProps} />
            ) : (
              <SceneBoundary fallback={() => setMode("2d")}>
                <Suspense
                  fallback={
                    <div className="graph-unavailable" role="status">
                      Загружаем 3D-карту…
                    </div>
                  }
                >
                  <ForceScene3D {...sceneProps} />
                </Suspense>
              </SceneBoundary>
            )}
            <div className="graph-stage-controls">
              <button
                className="icon-button"
                title="Приблизить"
                aria-label="Увеличить карту"
                onClick={() => controls.current?.zoom(1.3)}
              >
                <Plus size={18} />
              </button>
              <button
                className="icon-button"
                title="Отдалить"
                aria-label="Уменьшить карту"
                onClick={() => controls.current?.zoom(1 / 1.3)}
              >
                <Minus size={18} />
              </button>
              <button
                className="icon-button"
                title="Уместить на экране"
                aria-label="Уместить граф на экране"
                onClick={() => controls.current?.fit()}
              >
                <Maximize2 size={17} />
              </button>
              <button
                className="icon-button"
                title="Сбросить расположение узлов"
                aria-label="Сбросить расположение узлов"
                onClick={() => controls.current?.reset()}
              >
                <RotateCcw size={17} />
              </button>
            </div>
            {hovered && !selectedEdge && (
              <div className="graph-hover-card">
                <strong>{hovered.name}</strong>
                <span>{hovered.jobTitle ?? "Должность не указана"}</span>
                <small>
                  {hovered.department?.name ?? "Отдел не указан"} ·{" "}
                  {hovered.role?.label ?? "Роль не указана"}
                </small>
              </div>
            )}
            {selectedEdge && (
              <div className="graph-edge-card">
                <button
                  className="icon-button"
                  aria-label="Закрыть описание связи"
                  onClick={() => setEdge(null)}
                >
                  <X size={16} />
                </button>
                <strong>
                  {names.get(selectedEdge.source)} →{" "}
                  {names.get(selectedEdge.target)}
                </strong>
                <p>{selectedEdge.label}</p>
                <span>
                  {selectedEdge.confirmed
                    ? "Подтверждённая связь"
                    : "Требует проверки"}
                </span>
              </div>
            )}
            <div className="graph-canvas-caption">
              <Network size={14} />
              <span>
                {mode === "2d" ? "Свободное расположение" : "Объёмный граф"}
              </span>
            </div>
          </div>
          <aside className="graph-directory" aria-label="Участники карты">
            <div>
              <strong>Участники</strong>
              <span>{visible.nodes.length}</span>
            </div>
            <ul>
              {visible.nodes.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    aria-pressed={person.id === selectedId}
                    onMouseEnter={() => setHovered(person.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(person.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => select(person.id)}
                  >
                    <i style={{ backgroundColor: color(person) }} />
                    <span>
                      <strong>{person.name}</strong>
                      <small>
                        {person.department?.name ?? "Отдел не указан"}
                      </small>
                    </span>
                    {person.decisionMaker && <b>ЛПР</b>}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <Network size={28} />
          <h3>
            {graph.nodes.length
              ? "Никто не найден"
              : "Участники проекта не указаны"}
          </h3>
          <p>
            {graph.nodes.length
              ? "Измените фильтры или откройте всю карту."
              : "Карта появится после добавления участников."}
          </p>
          {graph.nodes.length > 0 && (
            <button
              className="secondary"
              onClick={() => {
                setSmart(emptyContactFilters);
                setFilters(emptyFilters);
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      <div className="graph-footer">
        <div className="graph-legend">
          {(colorMode === "role"
            ? graph.filters.roles.map((role) => ({
                id: role.code,
                name: role.label,
                color: nodeColor(
                  { role } as (typeof graph.nodes)[number],
                  "role",
                  departments,
                ),
              }))
            : graph.filters.departments.map((department) => ({
                id: department.id,
                name: department.name,
                color: nodeColor(
                  { department } as (typeof graph.nodes)[number],
                  "department",
                  departments,
                ),
              }))
          ).map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={
                (colorMode === "role" ? smart.role : smart.department) ===
                group.id
              }
              onClick={() => {
                const key = colorMode === "role" ? "role" : "department";
                setSmart({
                  ...smart,
                  [key]: smart[key] === group.id ? "" : group.id,
                });
              }}
            >
              <i style={{ backgroundColor: group.color }} />
              {group.name}
            </button>
          ))}
        </div>
        <div className="graph-options">
          <label>
            <input
              type="checkbox"
              checked={labels}
              onChange={(event) => setLabels(event.target.checked)}
            />
            Подписи
          </label>
          <button
            className="text-button"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Продолжить движение" : "Остановить движение"}
          </button>
          <button
            className="icon-button"
            aria-label={dark ? "Светлая карта" : "Тёмная карта"}
            title={dark ? "Светлая карта" : "Тёмная карта"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
      <p className="graph-instructions" id="graph-instructions">
        {mode === "2d"
          ? "Перетаскивайте фон для перемещения, колесо — для масштаба."
          : "Перетаскивайте фон для поворота, правой кнопкой — для перемещения, колесо — для масштаба."}{" "}
        Размер узла — указанное влияние. Оранжевые связи требуют проверки.
      </p>
      <details
        className="graph-connections"
        open={connectionsOpen}
        onToggle={(event) => setConnectionsOpen(event.currentTarget.open)}
      >
        <summary>
          Связи и их смысл <span>{visible.edges.length}</span>
        </summary>
        {visible.edges.length ? (
          <ul>
            {visible.edges.map((edge) => (
              <li key={edge.id}>
                <button
                  className={edge.id === edgeId ? "selected" : ""}
                  onClick={() => setEdge(edgeId === edge.id ? null : edge.id)}
                >
                  <strong>
                    {names.get(edge.source)} → {names.get(edge.target)}
                  </strong>
                  <span>{edge.label}</span>
                  <small>
                    {edge.confirmed ? "Подтверждена" : "Требует проверки"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Связи между этими участниками не указаны.</p>
        )}
      </details>
    </section>
  );
}
