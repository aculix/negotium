<script>
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import lottie from 'lottie-web';
  import './style.css';

  import { toKey, addDays, fromKey, labelFor, formatLong } from './lib/dates.js';
  import { createStorage } from './lib/storage.js';
  import { rollover, msUntilNextMidnight } from './lib/rollover.js';
  import * as taskOps from './lib/tasks.js';

  const storage = createStorage();

  let tasks = $state([]);
  let newTask = $state('');
  let darkMode = $state(false);
  let isLoading = $state(true);
  let isInitialized = false;
  let todayKey = $state(toKey(new Date()));
  let selectedKey = $state(toKey(new Date()));
  let draggedItem = $state(null);
  let draggedOverIndex = $state(null);
  let midnightTimer = null;

  /** Single write path, so persistence cannot drift out of step with the list.
   *  Loading a different day assigns `tasks` directly and deliberately skips
   *  this — there is nothing new to save. */
  function setTasks(next) {
    tasks = next;
    if (isInitialized) storage.saveTasks(selectedKey, tasks);
  }

  function addTask() {
    const next = taskOps.addTask(tasks, newTask);
    if (next === tasks) return;
    setTasks(next);
    newTask = '';
  }

  function toggleTask(id) {
    setTasks(taskOps.toggleTask(tasks, id));
  }

  function deleteTask(id) {
    setTasks(taskOps.deleteTask(tasks, id));
  }

  function clearCompleted() {
    setTasks(taskOps.clearCompleted(tasks));
  }

  function toggleTheme() {
    darkMode = !darkMode;
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') addTask();
    else if (event.key === 'Escape') newTask = '';
  }

  function handleTaskKeydown(event, taskId) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggleTask(taskId);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      deleteTask(taskId);
    }
  }

  function handleDragStart(event, index) {
    draggedItem = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', event.target);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    draggedOverIndex = index;
  }

  function handleDragEnd(event) {
    event.preventDefault();
    
    if (draggedItem !== null && draggedOverIndex !== null && draggedItem !== draggedOverIndex) {
      setTasks(taskOps.reorderTask(tasks, draggedItem, draggedOverIndex));
    }

    draggedItem = null;
    draggedOverIndex = null;
  }

  function handleDragLeave() {
    draggedOverIndex = null;
  }

  function tomorrowKey() {
    return toKey(addDays(fromKey(todayKey), 1));
  }

  function switchDate() {
    selectedKey = selectedKey === todayKey ? tomorrowKey() : todayKey;
    tasks = storage.loadTasks(selectedKey);
  }

  /**
   * Re-evaluates the day boundary and reloads the visible list. Safe to call
   * repeatedly — rollover is idempotent within a day.
   *
   * If the day changed while the user was looking at Today, they stay on the
   * new Today. If they were looking at Tomorrow, that key has become Today and
   * they follow it there, which preserves the existing mental model.
   */
  function runRollover() {
    const now = new Date();
    const wasViewingToday = selectedKey === todayKey;

    todayKey = toKey(now);
    const todayTasks = rollover(storage, now);

    if (wasViewingToday) {
      selectedKey = todayKey;
      tasks = todayTasks;
    } else {
      tasks = storage.loadTasks(selectedKey);
    }
  }

  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
      runRollover();
      scheduleMidnight();
    }, msUntilNextMidnight(new Date()));
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') runRollover();
  }

  const currentDateDisplay = $derived(formatLong(selectedKey));
  const buttonText = $derived(labelFor(selectedKey, todayKey));

  const remainingTasks = $derived(tasks.filter(task => !task.completed).length);
  const completedTasks = $derived(tasks.filter(task => task.completed).length);

  $effect(() => {
    if (!isInitialized) return;
    storage.saveTheme(darkMode ? 'dark' : 'light');
  });

  function initLottie(node) {
    let instance = null;
    
    async function loadAnimation() {
      try {
        const response = await fetch('/lottie_empty_state.json');
        const animationData = await response.json();
        
        instance = lottie.loadAnimation({
          container: node,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: animationData
        });
      } catch (error) {
        console.error('Failed to load Lottie animation:', error);
      }
    }
    
    loadAnimation();
    
    return {
      destroy() {
        if (instance) {
          instance.destroy();
        }
      }
    };
  }

  onMount(() => {
    storage.migrateLegacyKeys();
    runRollover();

    const savedTheme = storage.loadTheme();
    darkMode = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;

    setTimeout(() => {
      isLoading = false;
      isInitialized = true;
    }, 500);

    // Four triggers, because no single one is sufficient. The timer covers a
    // pinned tab crossing midnight unattended; visibility and focus cover
    // machine sleep, where timers do not reliably fire.
    scheduleMidnight();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', runRollover);

    return () => {
      clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', runRollover);
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app" class:dark={darkMode}>
  {#if isLoading}
    <div class="loading-overlay" transition:fade={{ duration: 300 }}>
      <div class="loading">
        <svg class="loading-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.37 8.87988H17.62" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.38 8.87988L7.13 9.62988L9.38 7.37988" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12.37 15.8799H17.62" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.38 15.8799L7.13 16.6299L9.38 14.3799" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="loading-text">Loading Negotium...</div>
      </div>
    </div>
  {:else}
  <header class="header">
    <div class="header-content">
      <div class="logo-section">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.37 8.87988H17.62" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.38 8.87988L7.13 9.62988L9.38 7.37988" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12.37 15.8799H17.62" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.38 15.8799L7.13 16.6299L9.38 14.3799" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h1 class="app-title">Negotium</h1>
      </div>
      
      <div class="header-actions">
        <button class="today-btn" aria-label="Switch between Today and Tomorrow" onclick={switchDate}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2"/>
            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2"/>
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>
          </svg>
          {buttonText}
        </button>
        
        <button 
          class="theme-toggle" 
          onclick={toggleTheme}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <svg class="theme-icon" class:rotated={darkMode} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {#if darkMode}
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>
            {:else}
              <circle cx="12" cy="12" r="5" fill="currentColor"/>
              <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/>
              <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/>
              <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>
            {/if}
          </svg>
        </button>
      </div>
    </div>
  </header>

  <main class="main">
    <div class="container">
      <div class="content-header">
        <h2 class="section-title">To-dos</h2>
        <div class="date-display">{currentDateDisplay}</div>
      </div>

      <div class="task-input-container">
        <input
          bind:value={newTask}
          type="text"
          placeholder="+ Add a task"
          class="task-input"
          onkeydown={handleKeydown}
        />
      </div>

      <div class="task-stats" class:visible={tasks.length > 0}>
        <span class="task-count">
          {remainingTasks} {remainingTasks === 1 ? 'task' : 'tasks'} remaining
        </span>
        {#if completedTasks > 0}
          <button class="clear-completed" onclick={clearCompleted}>
            Clear completed
          </button>
        {/if}
      </div>

      <div class="task-list">
        {#key selectedKey}
          {#if tasks.length === 0}
            <div class="empty-state" transition:fade={{ duration: 200 }}>
              <div class="lottie-animation" use:initLottie></div>
              <p>No tasks yet. Add one above to get started!</p>
            </div>
          {:else}
            {#each tasks as task, index (task.id)}
              <div 
                class="task-item" 
                class:completed={task.completed}
                class:dragging={draggedItem === index}
                class:drag-over={draggedOverIndex === index}
                draggable="true"
                in:fly={{ y: -10, duration: 300, delay: index * 30, easing: cubicOut }}
                out:fly={{ x: 30, opacity: 0, duration: 250, delay: index * 20, easing: cubicOut }}
                ondragstart={(e) => handleDragStart(e, index)}
                ondragover={(e) => handleDragOver(e, index)}
                ondragend={handleDragEnd}
                ondragleave={handleDragLeave}
                onkeydown={(e) => handleTaskKeydown(e, task.id)}
                tabindex="0"
                role="button"
                aria-label={task.completed ? `Completed: ${task.text}` : `Incomplete: ${task.text}`}
              >
                <button 
                  class="checkbox" 
                  class:checked={task.completed}
                  onclick={() => toggleTask(task.id)}
                  aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
                >
                  {#if task.completed}
                    <svg class="checkmark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                </button>
                
                <span class="task-text">{task.text}</span>
                
                <button 
                  class="delete-btn" 
                  onclick={() => deleteTask(task.id)}
                  aria-label="Delete task"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M19,6V20A2,2 0 0,1 17,22H7A2,2 0 0,1 5,20V6M8,6V4A2,2 0 0,1 10,2H14A2,2 0 0,1 16,4V6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            {/each}
          {/if}
        {/key}
      </div>
    </div>
  </main>
  {/if}
</div>
