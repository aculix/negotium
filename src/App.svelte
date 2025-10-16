<script>
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import lottie from 'lottie-web';
  import './style.css';

  let tasks = [];
  let newTask = '';
  let darkMode = false;
  let inputElement;
  let isLoading = true;
  let isInitialized = false;
  let currentDate = new Date().toDateString();
  let selectedDate = new Date().toDateString();
  let draggedItem = null;
  let draggedOverIndex = null;

  function addTask() {
    if (newTask.trim()) {
      tasks = [...tasks, {
        id: Date.now(),
        text: newTask.trim(),
        completed: false,
        createdAt: Date.now()
      }];
      newTask = '';
    }
  }

  function toggleTask(id) {
    tasks = tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    );
  }

  function deleteTask(id) {
    tasks = tasks.filter(task => task.id !== id);
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
      const newTasks = [...tasks];
      const [movedTask] = newTasks.splice(draggedItem, 1);
      newTasks.splice(draggedOverIndex, 0, movedTask);
      tasks = newTasks;
    }
    
    draggedItem = null;
    draggedOverIndex = null;
  }

  function handleDragLeave() {
    draggedOverIndex = null;
  }

  function getCurrentDate() {
    return new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  function getDateKey(dateString) {
    return `negotium-tasks-${dateString}`;
  }

  function loadTasksForDate(dateString) {
    const savedTasks = localStorage.getItem(getDateKey(dateString));
    if (savedTasks) {
      tasks = JSON.parse(savedTasks);
    } else {
      tasks = [];
    }
  }

  function saveTasksForDate(dateString) {
    localStorage.setItem(getDateKey(dateString), JSON.stringify(tasks));
  }

  function checkAndMigrateTasks() {
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toDateString();
    
    const yesterdayTasks = localStorage.getItem(getDateKey(yesterdayString));
    if (yesterdayTasks && currentDate !== today) {
      const tasks = JSON.parse(yesterdayTasks);
      const todayTasks = localStorage.getItem(getDateKey(today));
      
      if (todayTasks) {
        const existingTodayTasks = JSON.parse(todayTasks);
        localStorage.setItem(getDateKey(today), JSON.stringify([...existingTodayTasks, ...tasks]));
      } else {
        localStorage.setItem(getDateKey(today), yesterdayTasks);
      }
      
      localStorage.removeItem(getDateKey(yesterdayString));
      currentDate = today;
    }
  }

  function switchDate() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    selectedDate = selectedDate === today.toDateString() 
      ? tomorrow.toDateString() 
      : today.toDateString();
    
    loadTasksForDate(selectedDate);
  }

  $: buttonText = (() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (selectedDate === today.toDateString()) return 'Today';
    if (selectedDate === tomorrow.toDateString()) return 'Tomorrow';
    return selectedDate.split(' ').slice(0, 3).join(' ');
  })();

  $: remainingTasks = tasks.filter(task => !task.completed).length;
  $: completedTasks = tasks.filter(task => task.completed).length;

  $: if (tasks && isInitialized) {
    saveTasksForDate(selectedDate);
  }

  $: if (darkMode !== undefined && isInitialized) {
    localStorage.setItem('negotium-theme', darkMode ? 'dark' : 'light');
  }

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
    checkAndMigrateTasks();
    loadTasksForDate(selectedDate);

    const savedTheme = localStorage.getItem('negotium-theme');
    darkMode = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;

    setTimeout(() => {
      isLoading = false;
      isInitialized = true;
    }, 500);
  });
</script>

<svelte:window on:keydown={handleKeydown} />

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
        <button class="today-btn" aria-label="Switch between Today and Tomorrow" on:click={switchDate}>
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
          on:click={toggleTheme}
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
        <div class="date-display">{getCurrentDate()}</div>
      </div>

      <div class="task-input-container">
        <input
          bind:this={inputElement}
          bind:value={newTask}
          type="text"
          placeholder="+ Add a task"
          class="task-input"
          on:keydown={handleKeydown}
        />
      </div>

      <div class="task-stats" class:visible={tasks.length > 0}>
        <span class="task-count">
          {remainingTasks} {remainingTasks === 1 ? 'task' : 'tasks'} remaining
        </span>
        {#if completedTasks > 0}
          <button class="clear-completed" on:click={() => tasks = tasks.filter(task => !task.completed)}>
            Clear completed
          </button>
        {/if}
      </div>

      <div class="task-list">
        {#key selectedDate}
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
                on:dragstart={(e) => handleDragStart(e, index)}
                on:dragover={(e) => handleDragOver(e, index)}
                on:dragend={handleDragEnd}
                on:dragleave={handleDragLeave}
                on:keydown={(e) => handleTaskKeydown(e, task.id)}
                tabindex="0"
                role="button"
                aria-label={task.completed ? `Completed: ${task.text}` : `Incomplete: ${task.text}`}
              >
                <button 
                  class="checkbox" 
                  class:checked={task.completed}
                  on:click={() => toggleTask(task.id)}
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
                  on:click={() => deleteTask(task.id)}
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
