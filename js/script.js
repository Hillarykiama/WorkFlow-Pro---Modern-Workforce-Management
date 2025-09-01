// Main application functionality

// Show different views in the demo dashboard
function showView(viewName) {
    // Hide all views
    document.querySelectorAll('.schedule-view, .tasks-view, .chat-view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Remove active class from nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected view
    document.getElementById(viewName).classList.add('active');
    
    // Add active class to clicked nav item
    event.target.classList.add('active');
}

// Add smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Initialize interactive elements when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeTaskCards();
    initializeChatInput();
    initializeScheduleInteractions();
    initializeMobileMenu();
});

// Task card interactions
function initializeTaskCards() {
    document.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('click', function() {
            // Add click animation
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
            
            // You can add more functionality here like opening task details modal
            console.log('Task clicked:', this.querySelector('.task-title').textContent);
        });
    });
}

// Chat input functionality
function initializeChatInput() {
    const chatInput = document.querySelector('.chat-input input');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.trim()) {
                addNewMessage(this.value.trim());
                this.value = '';
            }
        });
    }
}

// Add new message to chat
function addNewMessage(messageText) {
    const messagesContainer = document.querySelector('.chat-messages');
    const newMessage = document.createElement('div');
    newMessage.className = 'message own';
    newMessage.textContent = messageText;
    messagesContainer.appendChild(newMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Schedule interactions
function initializeScheduleInteractions() {
    // Add shift button functionality
    const addShiftBtn = document.querySelector('.calendar-header .btn-primary');
    if (addShiftBtn) {
        addShiftBtn.addEventListener('click', function() {
            // Placeholder for add shift functionality
            alert('Add Shift functionality - to be connected to backend');
        });
    }
    
    // Calendar day click interactions
    document.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', function() {
            // Highlight selected day
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            this.classList.add('selected');
            
            // Add CSS for selected state
            if (!document.querySelector('#selected-day-style')) {
                const style = document.createElement('style');
                style.id = 'selected-day-style';
                style.textContent = '.calendar-day.selected { border: 2px solid #6366f1; }';
                document.head.appendChild(style);
            }
        });
    });
}

// Chat channel switching
function switchChatChannel(channelName) {
    // Update active channel
    document.querySelectorAll('.chat-channel').forEach(channel => {
        channel.classList.remove('active');
    });
    
    // Find and activate clicked channel
    const clickedChannel = Array.from(document.querySelectorAll('.chat-channel'))
        .find(channel => channel.textContent.trim() === channelName);
    
    if (clickedChannel) {
        clickedChannel.classList.add('active');
        
        // Clear messages and load channel-specific messages
        const messagesContainer = document.querySelector('.chat-messages');
        messagesContainer.innerHTML = getChannelMessages(channelName);
    }
}

// Get messages for specific channel (mock data)
function getChannelMessages(channelName) {
    const channelMessages = {
        '# general': `
            <div class="message">
                <strong>Mike:</strong> Hey team, how's the project going?
            </div>
            <div class="message own">
                Making good progress! Should be done by Friday.
            </div>
            <div class="message">
                <strong>Lisa:</strong> Great! Let me know if you need any help.
            </div>
        `,
        '# projects': `
            <div class="message">
                <strong>Sarah:</strong> Updated the project timeline in the dashboard.
            </div>
            <div class="message">
                <strong>John:</strong> Thanks! I'll review the changes.
            </div>
        `,
        '# random': `
            <div class="message">
                <strong>Lisa:</strong> Anyone up for lunch later?
            </div>
            <div class="message own">
                Sure! What time works for everyone?
            </div>
        `
    };
    
    return channelMessages[channelName] || '<div class="message">No messages yet...</div>';
}

// Initialize chat channel clicks
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.chat-channel').forEach(channel => {
        channel.addEventListener('click', function() {
            switchChatChannel(this.textContent.trim());
        });
    });
});

// Mobile menu functionality
function initializeMobileMenu() {
    // Create mobile menu toggle if screen is small
    if (window.innerWidth <= 768) {
        createMobileMenuToggle();
    }
    
    // Listen for window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth <= 768 && !document.querySelector('.mobile-menu-toggle')) {
            createMobileMenuToggle();
        } else if (window.innerWidth > 768) {
            removeMobileMenuToggle();
        }
    });
}

// Create mobile menu toggle button
function createMobileMenuToggle() {
    const nav = document.querySelector('.nav');
    const existingToggle = document.querySelector('.mobile-menu-toggle');
    
    if (!existingToggle) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'mobile-menu-toggle';
        toggleBtn.innerHTML = '☰';
        toggleBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #6366f1;
            display: block;
        `;
        
        // Insert before auth buttons
        const authButtons = document.querySelector('.auth-buttons');
        nav.insertBefore(toggleBtn, authButtons);
        
        // Add click event
        toggleBtn.addEventListener('click', toggleMobileMenu);
    }
}

// Remove mobile menu toggle
function removeMobileMenuToggle() {
    const toggle = document.querySelector('.mobile-menu-toggle');
    if (toggle) {
        toggle.remove();
    }
}

// Toggle mobile menu visibility
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    
    if (navLinks.style.display === 'flex') {
        navLinks.style.display = 'none';
    } else {
        navLinks.style.cssText = `
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            padding: 1rem;
            z-index: 1000;
        `;
    }
}

// Task management functions
function addNewTask(title, assignee, priority = 'medium', dueDate = '') {
    const todoColumn = document.querySelector('.kanban-column:first-child .kanban-header').nextElementSibling;
    
    const taskCard = document.createElement('div');
    taskCard.className = `task-card priority-${priority}`;
    taskCard.innerHTML = `
        <div class="task-title">${title}</div>
        <div class="task-meta">
            <span>Due: ${dueDate || 'No deadline'}</span>
            <span>👤 ${assignee}</span>
        </div>
    `;
    
    // Insert before the first task or at the beginning
    const firstTask = todoColumn.querySelector('.task-card');
    if (firstTask) {
        todoColumn.insertBefore(taskCard, firstTask);
    } else {
        todoColumn.appendChild(taskCard);
    }
    
    // Add click event to new task
    taskCard.addEventListener('click', function() {
        this.style.transform = 'scale(0.98)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
    
    // Update task count
    updateTaskCounts();
}

// Update task counts in column headers
function updateTaskCounts() {
    const columns = document.querySelectorAll('.kanban-column');
    const columnNames = ['📋 To Do', '🔄 In Progress', '✅ Completed'];
    
    columns.forEach((column, index) => {
        const taskCount = column.querySelectorAll('.task-card').length;
        const header = column.querySelector('.kanban-header');
        header.textContent = `${columnNames[index]} (${taskCount})`;
    });
}

// Move task between columns (drag and drop simulation)
function moveTask(taskElement, targetColumn) {
    targetColumn.appendChild(taskElement);
    updateTaskCounts();
    
    // Add animation
    taskElement.style.transform = 'scale(1.05)';
    setTimeout(() => {
        taskElement.style.transform = '';
    }, 200);
}

// Schedule management functions
function addNewShift(day, employee, startTime, endTime) {
    const dayElement = document.querySelector(`.calendar-day:nth-child(${day})`);
    if (dayElement) {
        const shift = document.createElement('div');
        shift.className = 'shift';
        shift.textContent = `${employee} ${startTime}-${endTime}`;
        dayElement.appendChild(shift);
        
        // Add animation
        shift.style.opacity = '0';
        shift.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            shift.style.transition = 'all 0.3s ease';
            shift.style.opacity = '1';
            shift.style.transform = 'translateY(0)';
        }, 100);
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Demo data and interactions for testing
function initializeDemoData() {
    // Add some demo interactions
    console.log('WorkFlow Pro - Demo initialized');
    
    // Example: Show notification on page load
    setTimeout(() => {
        showNotification('Welcome to WorkFlow Pro! 🎉', 'success');
    }, 2000);
}

// Initialize demo when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeDemoData();
});

// Export functions for potential use in other modules
window.WorkFlowPro = {
    showView,
    addNewTask,
    addNewShift,
    showNotification,
    switchChatChannel,
    updateTaskCounts
};