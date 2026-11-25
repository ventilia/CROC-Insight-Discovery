import { useId, useState } from "react";
import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import { ContactFilters, emptyContactFilters } from "./ContactFilters";
import { contactMatches, roleTone, type InitiativeData } from "./workspace";
import {
  edgeLine,
  layoutGraph,
  nodeHeight,
  nodeWidth,
  selectGraph,
  type Graph,
  type MapFilters,
} from "./graph";

const emptyFilters: MapFilters = {
  role: "",
  department: "",
  search: "",
  focus: null,
};

export function InfluenceMap({
  item,
  selectedId,
  onSelect,
}: {
  item: InitiativeData;
  selectedId: string | null;
  onSelect: (id: string, button: HTMLButtonElement) => void;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [smart, setSmart] = useState(emptyContactFilters);
  const [zoom, setZoom] = useState(1);
  const marker = useId();
  const graph = item.graph;
  const selection = selectGraph(graph, filters);
  const nodes = selection.nodes.filter((person) =>
    contactMatches(person, item, smart),
  );
  const ids = new Set(nodes.map((person) => person.id));
  const visible = {
    nodes,
    edges: selection.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
  const layout = visible ? layoutGraph(visible.nodes) : null;
  const focus = graph?.nodes.find((node) => node.id === filters.focus);
  const filtered = Object.values(filters).some(Boolean);
  const names = new Map(graph?.nodes.map((node) => [node.id, node.name]));

  return (
    <section className="surface influence-map" aria-labelledby="map-heading">
      <div className="surface-head">
        <div>
          <h2 id="map-heading">
            Карта влияния <span>{visible?.nodes.length ?? "—"}</span>
          </h2>
          <p>Выберите человека, чтобы увидеть его позицию и историю.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!graph || (!selectedId && !filters.focus)}
          aria-pressed={!!filters.focus}
          onClick={() => {
            setFilters(
              filters.focus
                ? emptyFilters
                : { ...emptyFilters, focus: selectedId },
            );
            setSmart(emptyContactFilters);
          }}
        >
          <Focus size={15} />
          {filters.focus ? "Вся карта" : "Окружение выбранного"}
        </button>
      </div>
      {graph && visible && layout && (
        <>
          <ContactFilters item={item} value={smart} change={setSmart} />
          {filtered && (
            <button
              type="button"
              className="text-button map-reset"
              onClick={() => {
                setFilters(emptyFilters);
                setSmart(emptyContactFilters);
              }}
            >
              Сбросить окружение
            </button>
          )}
          <div className="map-caption" role="status">
            <span>
              {focus
                ? "Окружение: " + focus.name + " · прямые связи"
                : "Участники выбранной инициативы"}
            </span>
            <span>
              {visible.nodes.length} из {graph.nodes.length} · связей{" "}
              {visible.edges.length}
            </span>
          </div>
          {visible.nodes.length ? (
            <>
              <div
                className="map-scroll"
                tabIndex={0}
                role="region"
                aria-label="Интерактивная карта связей"
              >
                <div
                  style={{
                    width: layout.width * zoom,
                    height: layout.height * zoom,
                  }}
                >
                  <div
                    className="map-canvas"
                    style={{
                      width: layout.width,
                      height: layout.height,
                      transform: `scale(${zoom})`,
                    }}
                  >
                    <svg
                      width={layout.width}
                      height={layout.height}
                      aria-hidden="true"
                    >
                      <defs>
                        <marker
                          id={marker}
                          viewBox="0 0 10 10"
                          refX="9"
                          refY="5"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#537768" />
                        </marker>
                      </defs>
                      {visible.edges.map((edge) => {
                        const line = edgeLine(
                          layout.positions.get(edge.source)!,
                          layout.positions.get(edge.target)!,
                        );
                        return (
                          line && (
                            <line
                              key={edge.id}
                              {...line}
                              stroke="#537768"
                              strokeWidth={2}
                              strokeDasharray={
                                edge.confirmed ? undefined : "6 5"
                              }
                              markerEnd={`url(#${marker})`}
                            />
                          )
                        );
                      })}
                    </svg>
                    {visible.nodes.map((node) => {
                      const point = layout.positions.get(node.id)!;
                      return (
                        <button
                          key={node.id}
                          type="button"
                          className={
                            "map-node tone-" +
                            roleTone(node.role?.code) +
                            " influence-" +
                            (node.influence ?? "UNKNOWN") +
                            (node.id === selectedId ? " active" : "")
                          }
                          style={{
                            left: point.x,
                            top: point.y,
                            width: nodeWidth,
                            height: nodeHeight,
                          }}
                          aria-pressed={node.id === selectedId}
                          onClick={(event) =>
                            onSelect(node.id, event.currentTarget)
                          }
                        >
                          <span className="map-node-department">
                            {node.department?.name ?? "Отдел не указан"}
                            {node.decisionMaker && <b>ЛПР</b>}
                          </span>
                          <strong>{node.name}</strong>
                          <span className="map-node-job">
                            {node.jobTitle ?? "Должность не указана"}
                          </span>
                          <span className="map-node-role">
                            {node.role?.label ?? "Роль не указана"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="map-legend">
                {graph.filters.roles.map((role) => (
                  <span key={role.code}>
                    <i className={"legend-dot tone-" + roleTone(role.code)} />
                    {role.label}
                  </span>
                ))}
              </div>
              <div className="map-controls">
                <span>
                  Стрелка указывает направление связи. Пунктир — требует
                  проверки.
                </span>
                <div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Уменьшить карту"
                    disabled={zoom <= 0.6}
                    onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}
                  >
                    <Minus size={15} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Увеличить карту"
                    disabled={zoom >= 1.6}
                    onClick={() => setZoom(Math.min(1.6, zoom + 0.2))}
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Сбросить масштаб"
                    onClick={() => setZoom(1)}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>
              <div className="map-connections">
                <h3>Связи и их смысл</h3>
                {visible.edges.length ? (
                  <ul>
                    {visible.edges.map((edge) => (
                      <li key={edge.id}>
                        <strong>
                          {names.get(edge.source)} → {names.get(edge.target)}
                        </strong>
                        <p>{edge.label}</p>
                        <small>
                          {edge.confirmed
                            ? "Подтверждено в источнике"
                            : "Требует проверки"}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Между показанными участниками нет записей о связях.
                    Попробуйте открыть окружение или сбросить фильтры.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="notice">
              {graph.nodes.length
                ? "По выбранным фильтрам никого нет."
                : "В инициативе пока нет участников."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
