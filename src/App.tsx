import {
  CalendarDays,
  Check,
  Cloud,
  Loader2,
  Search,
  ShoppingBasket,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { appConfig, hasGoogleConfig } from './config';
import { loadCatalog } from './data/catalog';
import { generateRandomWeeklyPlan } from './domain/autoPlanner';
import { addDays, formatDisplayDate, getWeekStart } from './domain/dates';
import {
  MEAL_LABELS,
  MEAL_TYPES,
  buildShoppingListNote,
  buildShoppingList,
  createEmptyPlan,
  isRecipeAllowedForMeal,
  mergeLatestPlan,
  sanitizePlanForCatalog,
  setSlotRecipe,
} from './domain/planner';
import { createGoogleAuthClient, type GoogleAuthClient } from './integrations/googleAuth';
import {
  createGoogleSheetsPlanClient,
  type GoogleSheetsPlanClient,
  type PlanStoreMeta,
} from './integrations/googleSheetsPlans';
import type { Catalog, MealType, Recipe, WeeklyPlan } from './types';

const LOCAL_PLAN_PREFIX = 'meal-planner.plan.';
const GOOGLE_KEEP_CREATE_URL = 'https://keep.google.com/#create';
const KEEP_URL_MAX_LENGTH = 12000;

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>({ recipes: [], ingredients: [] });
  const [plan, setPlan] = useState<WeeklyPlan>(() => createEmptyPlan(getWeekStart()));
  const [query, setQuery] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [status, setStatus] = useState('Cargando catálogo...');
  const [isBusy, setIsBusy] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [planStore, setPlanStore] = useState<PlanStoreMeta | null>(null);
  const [authClient, setAuthClient] = useState<GoogleAuthClient | null>(null);
  const planClient = useMemo<GoogleSheetsPlanClient>(
    () => createGoogleSheetsPlanClient(appConfig.googleApiKey),
    [],
  );

  useEffect(() => {
    loadCatalog(appConfig.recipesCsvUrl, appConfig.ingredientsCsvUrl)
      .then((loadedCatalog) => {
        setCatalog(loadedCatalog);
        setActiveRecipeId(loadedCatalog.recipes[0]?.id ?? null);
        setPlan((currentPlan) => sanitizePlanForCatalog(currentPlan, loadedCatalog));
        setStatus('Catálogo listo');
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const localPlan = readLocalPlan(plan.weekStart);

    if (localPlan) {
      setPlan(localPlan);
    }
  }, [plan.weekStart]);

  const recipesById = useMemo(
    () => new Map(catalog.recipes.map((recipe) => [recipe.id, recipe])),
    [catalog.recipes],
  );

  const filteredRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return catalog.recipes;
    }

    return catalog.recipes.filter((recipe) =>
      `${recipe.name} ${recipe.category}`.toLowerCase().includes(normalizedQuery),
    );
  }, [catalog.recipes, query]);

  const shoppingList = useMemo(() => buildShoppingList(plan, catalog), [catalog, plan]);

  async function connectGoogle() {
    if (!hasGoogleConfig) {
      setStatus('Falta configurar VITE_GOOGLE_CLIENT_ID y VITE_GOOGLE_API_KEY');
      return;
    }

    setIsBusy(true);

    try {
      const nextAuthClient = authClient ?? (await createGoogleAuthClient(appConfig.googleClientId));
      const token = await nextAuthClient.getAccessToken();
      const store =
        (await planClient.findPlanStore(token)) ?? (await planClient.createPlanStore(token));
      const remotePlan = await planClient.loadPlan(token, store.spreadsheetId, plan.weekStart);
      const latestPlan = sanitizePlanForCatalog(mergeLatestPlan(plan, remotePlan), catalog);

      setAuthClient(nextAuthClient);
      setAccessToken(token);
      setPlanStore(store);
      persistLocalPlan(latestPlan);
      setPlan(latestPlan);
      setStatus('Google Drive conectado');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo conectar Google');
    } finally {
      setIsBusy(false);
    }
  }

  async function savePlan() {
    persistLocalPlan(plan);

    if (!accessToken || !planStore) {
      setStatus('Plan guardado localmente');
      return;
    }

    setIsBusy(true);

    try {
      await planClient.savePlan(accessToken, planStore.spreadsheetId, plan);
      setStatus('Plan guardado en Google Sheets');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo guardar el plan');
    } finally {
      setIsBusy(false);
    }
  }

  function changeWeek(weekStart: string) {
    setPlan(
      sanitizePlanForCatalog(readLocalPlan(weekStart) ?? createEmptyPlan(weekStart), catalog),
    );
  }

  function assignRecipe(date: string, mealType: MealType, recipeId: string | null) {
    setPlan((currentPlan) => {
      const recipe = recipeId ? recipesById.get(recipeId) : null;

      if (recipe && !isRecipeAllowedForMeal(recipe, mealType)) {
        setStatus(`${recipe.name} no está configurada para ${MEAL_LABELS[mealType].toLowerCase()}`);
        return currentPlan;
      }

      const nextPlan = setSlotRecipe(currentPlan, date, mealType, recipeId);
      persistLocalPlan(nextPlan);
      return nextPlan;
    });
  }

  function fillWeekRandomly() {
    if (catalog.recipes.length === 0) {
      setStatus('No hay recetas cargadas para generar el plan');
      return;
    }

    const nextPlan = generateRandomWeeklyPlan(createEmptyPlan(plan.weekStart), catalog);
    persistLocalPlan(nextPlan);
    setPlan(nextPlan);
    setStatus('Semana rellenada aleatoriamente con recomendaciones de consumo');
  }

  function clearVisiblePlan() {
    const shouldClear = window.confirm(
      'Se borrará toda la planificación visible de esta semana. Los cambios no guardados se perderán.',
    );

    if (!shouldClear) {
      return;
    }

    const nextPlan = createEmptyPlan(plan.weekStart);
    localStorage.removeItem(`${LOCAL_PLAN_PREFIX}${plan.weekStart}`);
    setPlan(nextPlan);
    setStatus(
      'Planificación en pantalla borrada. Pulsa Guardar para aplicar el borrado en Google.',
    );
  }

  function openShoppingListInKeep() {
    const noteContent = buildShoppingListNote(shoppingList, plan.weekStart);
    const keepUrl = buildGoogleKeepCreateUrl(noteContent);

    window.open(keepUrl, '_blank', 'noopener,noreferrer');
    void copyTextToClipboard(noteContent);
    setStatus('Lista de la compra copiada y Google Keep abierto');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Planificador de comidas</h1>
          <p>{status}</p>
        </div>
        <div className="topbar-actions">
          <label className="week-control">
            <CalendarDays size={18} aria-hidden="true" />
            <span>Semana</span>
            <input
              type="date"
              value={plan.weekStart}
              onChange={(event) => changeWeek(event.target.value)}
            />
          </label>
          <button className="secondary-button" onClick={connectGoogle} disabled={isBusy}>
            {isBusy ? <Loader2 className="spin" size={17} /> : <Cloud size={17} />}
            {planStore ? 'Conectado' : 'Conectar Google'}
          </button>
          <button className="primary-button" onClick={savePlan} disabled={isBusy}>
            <Check size={17} />
            Guardar
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Planificador semanal">
        <aside className="panel recipes-panel">
          <div className="panel-heading">
            <h2>Recetas</h2>
            <span>{catalog.recipes.length} recetas</span>
          </div>
          <label className="search-box">
            <Search size={17} aria-hidden="true" />
            <input
              placeholder="Buscar receta o categoría"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="recipe-list">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                className={recipe.id === activeRecipeId ? 'recipe-card selected' : 'recipe-card'}
                onClick={() => setActiveRecipeId(recipe.id)}
              >
                <span>{recipe.name}</span>
                <small>
                  {recipe.category} · {recipe.servings} raciones ·{' '}
                  {formatAllowedMeals(recipe.allowedMealTypes)}
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="planner-panel">
          <div className="panel-heading">
            <h2>Menú semanal</h2>
            <div className="planner-heading-actions">
              <span>Última edición {new Date(plan.updatedAt).toLocaleString('es-ES')}</span>
              <button className="secondary-button compact-button" onClick={fillWeekRandomly}>
                <Shuffle size={16} />
                Rellenar semana
              </button>
              <button
                className="secondary-button compact-button danger-button"
                onClick={clearVisiblePlan}
              >
                <Trash2 size={16} />
                Borrar pantalla
              </button>
            </div>
          </div>
          <div className="week-grid">
            {Array.from({ length: 7 }).map((_, dayIndex) => {
              const date = addDays(plan.weekStart, dayIndex);

              return (
                <article className="day-column" key={date}>
                  <header>
                    <strong>
                      {new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(
                        new Date(`${date}T00:00:00.000Z`),
                      )}
                    </strong>
                    <span>{formatDisplayDate(date)}</span>
                  </header>
                  {MEAL_TYPES.map((mealType) => (
                    <MealSlotCard
                      key={`${date}-${mealType}`}
                      date={date}
                      mealType={mealType}
                      recipes={catalog.recipes}
                      selectedRecipe={readSlotRecipe(plan, recipesById, date, mealType)}
                      activeRecipeId={activeRecipeId}
                      activeRecipe={
                        activeRecipeId ? (recipesById.get(activeRecipeId) ?? null) : null
                      }
                      onAssign={assignRecipe}
                    />
                  ))}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="panel shopping-panel">
          <div className="panel-heading">
            <h2>Compra</h2>
            <span>{shoppingList.length} ingredientes</span>
          </div>
          <div className="shopping-header">
            <ShoppingBasket size={20} aria-hidden="true" />
            <p>Lista generada desde las recetas planificadas.</p>
          </div>
          <button
            className="primary-button shopping-note-button"
            onClick={openShoppingListInKeep}
            disabled={shoppingList.length === 0}
          >
            <ShoppingBasket size={17} />
            Lista de la Compra
          </button>
          <ul className="shopping-list">
            {shoppingList.map((item) => (
              <li key={item.ingredientId}>
                <div>
                  <strong>{item.ingredientName}</strong>
                  <ShoppingItemDetail category={item.category} recipeNames={item.recipeNames} />
                </div>
                <span>{formatShoppingQuantity(item.quantity, item.unit)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}

interface MealSlotCardProps {
  readonly date: string;
  readonly mealType: MealType;
  readonly recipes: readonly Recipe[];
  readonly selectedRecipe: Recipe | null;
  readonly activeRecipeId: string | null;
  readonly activeRecipe: Recipe | null;
  readonly onAssign: (date: string, mealType: MealType, recipeId: string | null) => void;
}

function MealSlotCard({
  date,
  mealType,
  recipes,
  selectedRecipe,
  activeRecipeId,
  activeRecipe,
  onAssign,
}: MealSlotCardProps) {
  const allowedRecipes = recipes.filter((recipe) => isRecipeAllowedForMeal(recipe, mealType));
  const canAssignActiveRecipe = Boolean(
    activeRecipeId && activeRecipe && isRecipeAllowedForMeal(activeRecipe, mealType),
  );

  return (
    <div className="meal-slot">
      <div className="meal-slot-header">
        <span>{MEAL_LABELS[mealType]}</span>
        <button
          className="mini-button"
          disabled={!canAssignActiveRecipe}
          onClick={() => onAssign(date, mealType, activeRecipeId)}
        >
          Asignar
        </button>
      </div>
      <p className={selectedRecipe ? 'selected-recipe-name' : 'selected-recipe-name empty'}>
        {selectedRecipe?.name ?? 'Sin receta asignada'}
      </p>
      <select
        aria-label={`${MEAL_LABELS[mealType]} ${date}`}
        value={selectedRecipe?.id ?? ''}
        onChange={(event) => onAssign(date, mealType, event.target.value || null)}
      >
        <option value="">Sin receta</option>
        {allowedRecipes.map((recipe) => (
          <option key={recipe.id} value={recipe.id}>
            {recipe.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function readSlotRecipe(
  plan: WeeklyPlan,
  recipesById: ReadonlyMap<string, Recipe>,
  date: string,
  mealType: MealType,
): Recipe | null {
  const recipeId =
    plan.slots.find((slot) => slot.date === date && slot.mealType === mealType)?.recipeId ?? null;

  return recipeId ? (recipesById.get(recipeId) ?? null) : null;
}

function readLocalPlan(weekStart: string): WeeklyPlan | null {
  const rawPlan = localStorage.getItem(`${LOCAL_PLAN_PREFIX}${weekStart}`);

  if (!rawPlan) {
    return null;
  }

  try {
    return JSON.parse(rawPlan) as WeeklyPlan;
  } catch {
    localStorage.removeItem(`${LOCAL_PLAN_PREFIX}${weekStart}`);
    return null;
  }
}

function persistLocalPlan(plan: WeeklyPlan) {
  localStorage.setItem(`${LOCAL_PLAN_PREFIX}${plan.weekStart}`, JSON.stringify(plan));
}

function buildGoogleKeepCreateUrl(noteContent: string): string {
  const url = `${GOOGLE_KEEP_CREATE_URL}?title=${encodeURIComponent(
    'Lista de la Compra',
  )}&text=${encodeURIComponent(noteContent)}`;

  return url.length <= KEEP_URL_MAX_LENGTH ? url : GOOGLE_KEEP_CREATE_URL;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
}

function formatAllowedMeals(mealTypes: readonly MealType[]): string {
  if (!mealTypes || mealTypes.length === 0 || mealTypes.length === 2) {
    return 'Almuerzo y cena';
  }

  return mealTypes[0] === 'lunch' ? 'Almuerzo' : 'Cena';
}

interface ShoppingItemDetailProps {
  readonly category: string;
  readonly recipeNames: readonly string[];
}

function ShoppingItemDetail({ category, recipeNames }: ShoppingItemDetailProps) {
  const normalizedCategory = category.trim();

  return (
    <div className="shopping-item-detail">
      {normalizedCategory ? <small>{normalizedCategory}</small> : null}
      {recipeNames.length > 1 ? (
        <ul className="shopping-recipe-list">
          {recipeNames.map((recipeName) => (
            <li key={recipeName}>{recipeName}</li>
          ))}
        </ul>
      ) : (
        <small>{recipeNames[0] ?? ''}</small>
      )}
    </div>
  );
}

function formatShoppingQuantity(quantity: number, unit: string): string {
  if (!unit.trim()) {
    return 'cantidad no especificada';
  }

  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(quantity)} ${unit}`;
}
