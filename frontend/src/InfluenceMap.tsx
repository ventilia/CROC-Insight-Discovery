import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Focus,
  Minus,
  Plus,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  Pause,
  Play,
  Search,
  X,
  Network,
  Pencil,
} from "lucide-react";
import { ContactFilters, emptyContactFilters } from "./ContactFilters";
import { ContactPortrait } from "./ContactPortrait";
import {
  contactMatches,
  influenceLabels,
  type InitiativeData,
} from "./workspace";
import { formatDate } from "./coverage";
import { selectGraph, type GraphEdge, type MapFilters } from "./graph";
import {
  edgeStroke,
  nodeColor,
  type ColorMode,
  type PositionCache,
  type SceneControls,
} from "./forceGraph";
import { departmentGraph } from "./departmentGraph";
import "./influence-map.css";

const ForceScene2D = lazy(() => import("./ForceScene2D"));

const emptyFilters: MapFilters = {
  role: "",
  department: "",
  search: "",
  focus: null,
  depth: 1,
};
const relationshipTypes: Record<string, string> = {
  APPROVAL: "Согласование",
  COORDINATION: "Координация",
  EXPERTISE: "Экспертиза",
};

export type MapNavigationContext = {
  focus: string | null;
  depth: 1 | 2;
  sharedOnly: boolean;
};

export function InfluenceMap({
  item,
  selectedId,
  onSelect,
  darkTheme = false,
  variant = "project",
  initialFocus = null,
  initialDepth = 1,
  initialSharedOnly = true,
  onlyIds,
  onAddRelationship,
  onEditRelationship,
}: {
  item: InitiativeData;
  selectedId: string | null;
  onSelect: (id: string, context?: MapNavigationContext) => void;
  darkTheme?: boolean;
  variant?: "project" | "profile";
  initialFocus?: string | null;
  initialDepth?: 1 | 2;
  initialSharedOnly?: boolean;
  onlyIds?: string[];
  onAddRelationship?: () => void;
  onEditRelationship?: (edge: GraphEdge) => void;
}) {
  const heading = useId();
  const inspectorHeading = useId();
  const compact = variant === "profile";
  const [filters, setFilters] = useState<MapFilters>({
      ...emptyFilters,
      focus: initialFocus,
      depth: initialDepth,
    }),
    [smart, setSmart] = useState(emptyContactFilters);
  const dark = darkTheme;
  const [colorMode, setColorMode] = useState<ColorMode>("role");
  const [view, setView] = useState<"people" | "departments">("people");
  const [sharedOnly, setSharedOnly] = useState(initialSharedOnly);
  const [edgeType, setEdgeType] = useState("");
  const [leaders, setLeaders] = useState(false);
  const [showFilters, setShowFilters] = useState(false),
    [labels, setLabels] = useState(true);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hoveredId, setHovered] = useState<string | null>(null),
    [edgeId, setEdge] = useState<string | null>(null);
  const [participantId, setParticipant] = useState(selectedId ?? initialFocus);
  const [size, setSize] = useState({ width: 600, height: 500 });
  const stage = useRef<HTMLDivElement>(null),
    controls = useRef<SceneControls | null>(null);
  const edgeHeading = useRef<HTMLHeadingElement>(null);
  const positions2D = useRef<PositionCache>(new Map());
  const graph = item.graph;
  const edgeTypes = [...new Set(graph.edges.map((edge) => edge.type))];
  const visible = useMemo(() => {
    const selection = selectGraph(graph, filters);
    const nodes = selection.nodes.filter(
      (person) =>
        contactMatches(person, item, smart) &&
        (!leaders || person.decisionMaker) &&
        (!sharedOnly || !onlyIds?.length || onlyIds.includes(person.id)),
    );
    const ids = new Set(nodes.map((person) => person.id));
    return {
      nodes,
      edges: selection.edges.filter(
        (edge) =>
          ids.has(edge.source) &&
          ids.has(edge.target) &&
          (!edgeType || edge.type === edgeType),
      ),
    };
  }, [graph, filters, smart, item, edgeType, leaders, onlyIds, sharedOnly]);
  const departments = useMemo(
    () => graph.filters.departments.map((department) => department.id).sort(),
    [graph],
  );
  const color = useMemo(
    () => (node: (typeof graph.nodes)[number]) =>
      nodeColor(node, colorMode, departments),
    [colorMode, departments],
  );
  const focus = graph.nodes.find((person) => person.id === filters.focus);
  const participant =
    visible.nodes.find((person) => person.id === participantId) ??
    visible.nodes.find((person) => person.decisionMaker) ??
    visible.nodes[0];
  const adjacent = participant
    ? graph.edges.filter(
        (edge) =>
          edge.source === participant.id || edge.target === participant.id,
      )
    : [];
  const lastTouch = item.coverage.contacts.find(
    (entry) => entry.id === participant?.id,
  )?.lastTouchAt;
  const selectedEdge = graph.edges.find((edge) => edge.id === edgeId);
  const filterCount = Object.values(smart).filter(Boolean).length;
  const names = new Map(graph.nodes.map((node) => [node.id, node.name]));
  useEffect(() => {
    if (edgeId) edgeHeading.current?.focus();
  }, [edgeId]);
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
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pauseMotion = () => setPaused(preference.matches);
    preference.addEventListener("change", pauseMotion);
    return () => preference.removeEventListener("change", pauseMotion);
  }, []);
  function select(id: string) {
    setHovered(null);
    setEdge(null);
    setParticipant(id);
  }
  function openProfile(id: string) {
    if (compact) {
      if (id !== selectedId) onSelect(id);
      return;
    }
    onSelect(id, {
      focus: filters.focus,
      depth: filters.depth ?? 1,
      sharedOnly,
    });
  }
  function resetFilters() {
    setSmart(emptyContactFilters);
    setFilters(emptyFilters);
    setLeaders(false);
    setSharedOnly(false);
    setEdgeType("");
    setEdge(null);
  }
  const grouped = useMemo(
    () => departmentGraph(visible.nodes, visible.edges),
    [visible],
  );
  const legendMode = view === "departments" ? "department" : colorMode;
  const sceneProps = {
    ...(view === "departments" ? grouped : visible),
    ...size,
    dark,
    labels,
    paused,
    selectedId: view === "people" ? (participant?.id ?? null) : null,
    focusId: view === "people" ? (focus?.id ?? null) : null,
    hoveredId:
      view === "departments" && !hoveredId?.startsWith("department:")
        ? null
        : hoveredId,
    color:
      view === "departments"
        ? (node: (typeof graph.nodes)[number]) =>
            nodeColor(node, "department", departments)
        : color,
    controls,
    positions: positions2D.current,
    onSelect: (id: string) => {
      stage.current?.focus({ preventScroll: true });
      if (view === "departments") {
        const group = grouped.nodes.find((g) => g.id === id);
        setSmart({
          ...emptyContactFilters,
          department: group?.department?.id ?? "UNASSIGNED",
        });
        setView("people");
        setHovered(null);
      } else select(id);
    },
    onOpen: view === "people" ? openProfile : undefined,
    onLink: (id: string) => {
      if (compact) return;
      setEdge(id);
      setHovered(null);
    },
    onHover: setHovered,
  };
  function toggleFocus(personId: string) {
    setFilters({
      ...emptyFilters,
      focus: focus ? null : personId,
      depth: filters.depth,
    });
    setSmart(emptyContactFilters);
    setEdge(null);
  }
  const depthControl = (
    <label className="graph-depth-control">
      Окружение
      <select
        aria-label="Глубина окружения"
        value={filters.depth ?? 1}
        disabled={!focus}
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
  );
  return (
    <section
      className={
        "influence-map force-map graph-map-surface" +
        (compact ? " graph-profile-map" : "") +
        (dark ? " graph-dark" : "")
      }
      aria-labelledby={heading}
    >
      <header className="surface-head graph-map-head">
        <h2 id={heading}>{compact ? "Окружение в проекте" : "Карта связей"}</h2>
        <div className="graph-head-actions">
          {compact && depthControl}
          {!compact && onAddRelationship && (
            <button
              className="secondary"
              onClick={onAddRelationship}
              disabled={graph.nodes.length < 2}
            >
              Добавить связь
            </button>
          )}

          {!compact && (
            <button
              className="secondary"
              type="button"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={15} />
              Фильтры{filterCount ? ` · ${filterCount}` : ""}
            </button>
          )}
          <button
            className="secondary"
            type="button"
            disabled={!participant && !filters.focus}
            aria-pressed={!!filters.focus}
            onClick={() => {
              const personId = compact ? selectedId : participant?.id;
              if (personId) toggleFocus(personId);
            }}
          >
            <Focus size={15} />
            {focus
              ? "Вся карта"
              : compact
                ? "К окружению"
                : "Окружение выбранного"}
          </button>
        </div>
      </header>
      {!compact && showFilters && (
        <ContactFilters
          item={item}
          value={smart}
          showSearch={false}
          showDecisionMaker={false}
          change={(value) => {
            setSmart(value);
            setEdge(null);
          }}
        />
      )}
      {!compact && (
        <div className="graph-toolbar">
          <label className="graph-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Найти участника на карте"
              type="search"
              placeholder="Имя, должность или email"
              value={smart.search}
              onChange={(event) => {
                setSmart({ ...smart, search: event.target.value });
                setEdge(null);
              }}
            />
          </label>
          <div className="graph-mode" role="group" aria-label="Масштаб карты">
            <button
              aria-pressed={view === "people"}
              onClick={() => {
                setView("people");
                setHovered(null);
              }}
            >
              Люди
            </button>
            <button
              aria-pressed={view === "departments"}
              onClick={() => {
                setView("departments");
                setHovered(null);
              }}
            >
              Отделы
            </button>
          </div>

          {onlyIds?.length ? (
            <button
              className="text-button"
              aria-pressed={sharedOnly}
              onClick={() => setSharedOnly(!sharedOnly)}
            >
              Общие участники · {onlyIds.length}
            </button>
          ) : null}

          <label className="graph-color-control">
            Тип связи
            <select
              value={edgeType}
              onChange={(e) => setEdgeType(e.target.value)}
            >
              <option value="">Все типы</option>
              {edgeTypes.map((type) => (
                <option key={type} value={type}>
                  {relationshipTypes[type] ?? type}
                </option>
              ))}
            </select>
          </label>

          {view === "people" && (
            <label className="graph-color-control">
              Цвет узлов
              <select
                aria-label="Цвет узлов"
                value={colorMode}
                onChange={(event) =>
                  setColorMode(event.target.value as ColorMode)
                }
              >
                <option value="role">По роли</option>
                <option value="department">По отделу</option>
              </select>
            </label>
          )}
          {focus && depthControl}
          {(filterCount > 0 || filters.focus || edgeType || leaders) && (
            <button className="text-button" onClick={resetFilters}>
              Сбросить
            </button>
          )}
        </div>
      )}
      <div className="graph-workspace">
        <div className="graph-board">
          {visible.nodes.length ? (
            <div
              className="force-stage"
              ref={stage}
              tabIndex={0}
              role="region"
              aria-label={
                view === "people"
                  ? "Интерактивный граф сотрудников"
                  : "Интерактивный граф отделов"
              }
            >
              <Suspense
                fallback={
                  <p className="empty-inline" role="status">
                    Загружаем граф…
                  </p>
                }
              >
                <ForceScene2D key={view} {...sceneProps} />
              </Suspense>
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
                {!compact && (
                  <button
                    className="icon-button"
                    title="Сбросить расположение узлов"
                    aria-label="Сбросить расположение узлов"
                    onClick={() => controls.current?.reset()}
                  >
                    <RotateCcw size={17} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state graph-empty">
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
              {!compact && graph.nodes.length > 0 && (
                <button className="secondary" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              )}
            </div>
          )}
          {!compact && (
            <>
              <div className="graph-footer">
                <div className="graph-legend">
                  {(legendMode === "role"
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
                        (legendMode === "role"
                          ? smart.role
                          : smart.department) === group.id
                      }
                      onClick={() => {
                        const key =
                          legendMode === "role" ? "role" : "department";
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
                </div>
              </div>
              <div
                className="graph-link-legend"
                aria-label="Обозначения связей"
              >
                {view === "people" &&
                  edgeTypes.map((type) => (
                    <span key={type}>
                      <i
                        style={{ borderColor: edgeStroke(type, true, dark) }}
                      />
                      {relationshipTypes[type] ?? type}
                    </span>
                  ))}
                <span>
                  <i
                    className="link-unconfirmed"
                    style={{ borderColor: edgeStroke("", false, dark) }}
                  />
                  Требует проверки
                </span>
                <span>Стрелка — направление связи</span>
              </div>
              <details className="graph-connections">
                <summary>
                  Связи и их смысл <span>{visible.edges.length}</span>
                </summary>
                {visible.edges.length ? (
                  <ul>
                    {visible.edges.map((edge) => (
                      <li key={edge.id}>
                        <button
                          className={edge.id === edgeId ? "selected" : ""}
                          aria-pressed={edge.id === edgeId}
                          onClick={() => {
                            setEdge(edgeId === edge.id ? null : edge.id);
                          }}
                        >
                          <strong>
                            {names.get(edge.source)} → {names.get(edge.target)}
                          </strong>
                          <span>{edge.label}</span>
                          <small>
                            {edge.confirmed
                              ? "Подтверждена"
                              : "Требует проверки"}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Связи между этими участниками не указаны.</p>
                )}
              </details>
            </>
          )}
        </div>
        {!compact && (
          <aside className="graph-inspector" aria-labelledby={inspectorHeading}>
            <header className="graph-inspector-heading">
              <h3 id={inspectorHeading}>Сведения о карте</h3>
              <p>{item.initiative.name}</p>
              <dl
                className="graph-inspector-stats"
                aria-label="Статистика карты"
              >
                <div>
                  <dt>Участники</dt>
                  <dd>{visible.nodes.length}</dd>
                </div>
                <div>
                  <dt>Связи</dt>
                  <dd>{visible.edges.length}</dd>
                </div>
                <div>
                  <dt>ЛПР</dt>
                  <dd>
                    {
                      visible.nodes.filter((person) => person.decisionMaker)
                        .length
                    }
                  </dd>
                </div>
              </dl>
            </header>
            {selectedEdge && (
              <section className="graph-detail" aria-label="Связь в проекте">
                <div className="graph-detail-heading">
                  <h3 ref={edgeHeading} tabIndex={-1}>
                    Связь в проекте
                  </h3>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Закрыть описание связи"
                    onClick={() => setEdge(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="graph-detail-endpoints">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => select(selectedEdge.source)}
                  >
                    {names.get(selectedEdge.source)}
                  </button>
                  <ArrowRight size={15} aria-label="в сторону" />
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => select(selectedEdge.target)}
                  >
                    {names.get(selectedEdge.target)}
                  </button>
                </div>
                <p>{selectedEdge.label}</p>
                <small>
                  {selectedEdge.confirmed
                    ? "Подтверждённая связь"
                    : "Требует проверки"}
                  {selectedEdge.sourceLabel && ` · ${selectedEdge.sourceLabel}`}
                </small>
                {onEditRelationship && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onEditRelationship(selectedEdge)}
                  >
                    <Pencil size={13} /> Редактировать связь
                  </button>
                )}
              </section>
            )}
            {participant && (
              <section className="graph-detail" aria-label="Выбранный участник">
                <div className="graph-detail-identity">
                  <ContactPortrait personId={participant.id} size={48} />
                  <div>
                    <h4>
                      <button
                        className="text-button graph-detail-person"
                        type="button"
                        onClick={() => openProfile(participant.id)}
                      >
                        {participant.name}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </button>
                    </h4>
                    <p>
                      {[participant.jobTitle, participant.department?.name]
                        .filter(Boolean)
                        .join(" · ") || "Должность не указана"}
                    </p>
                  </div>
                </div>
                <div className="graph-detail-meta">
                  {participant.role && <small>{participant.role.label}</small>}
                  {participant.decisionMaker && (
                    <span className="graph-lpr">ЛПР</span>
                  )}
                </div>
                <p>
                  Влияние ·{" "}
                  {influenceLabels[participant.influence ?? "UNKNOWN"]}
                </p>
                <p>Последнее общение · {formatDate(lastTouch ?? null)}</p>
                {participant.email && <p>{participant.email}</p>}
                {participant.phone && <p>{participant.phone}</p>}
              </section>
            )}
            <section className="graph-roster" aria-label="Участники карты">
              <div className="graph-roster-heading">
                <h3>
                  Участники <span>{visible.nodes.length}</span>
                </h3>
                <button
                  className="secondary graph-lpr-toggle"
                  type="button"
                  aria-pressed={leaders}
                  onClick={() => {
                    setLeaders(!leaders);
                    setEdge(null);
                  }}
                >
                  {leaders && <Check size={13} aria-hidden="true" />} Только ЛПР
                </button>
              </div>
              {visible.nodes.length ? (
                <ul className="graph-roster-list">
                  {visible.nodes.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        aria-pressed={person.id === participant?.id}
                        data-highlighted={person.id === hoveredId || undefined}
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
                        {person.decisionMaker && (
                          <span className="graph-lpr">ЛПР</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Нет участников для выбранных фильтров.</p>
              )}
            </section>
            {participant && (
              <section
                className="graph-adjacent"
                aria-label="Связи выбранного участника"
              >
                <h3>
                  Связи участника <span>{adjacent.length}</span>
                </h3>
                {adjacent.length ? (
                  <ul>
                    {adjacent.map((edge) => {
                      const outgoing = edge.source === participant.id;
                      const personId = outgoing ? edge.target : edge.source;
                      const Direction = outgoing ? ArrowUpRight : ArrowDownLeft;
                      return (
                        <li key={edge.id}>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => select(personId)}
                          >
                            {names.get(personId)}
                          </button>
                          <button
                            className="graph-relation-button"
                            type="button"
                            aria-pressed={edge.id === edgeId}
                            onClick={() =>
                              setEdge(edge.id === edgeId ? null : edge.id)
                            }
                          >
                            <Direction
                              size={14}
                              aria-label={
                                outgoing ? "Исходящая связь" : "Входящая связь"
                              }
                            />
                            {edge.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>Связи по этому проекту пока не указаны.</p>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
