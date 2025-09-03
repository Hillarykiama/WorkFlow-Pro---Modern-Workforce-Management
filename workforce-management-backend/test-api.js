const axios = require('axios');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

// Test user credentials
const TEST_USER = {
    email: 'test@example.com',
    password: 'Test123456!',
    first_name: 'Test',
    last_name: 'User',
    role: 'admin'
};

// Global variables
let authToken = null;
let createdTaskId = null;

// Helper function for API requests
const apiRequest = async (method, endpoint, data = null, token = null) => {
    try {
        const config = {
            method,
            url: `${API_URL}${endpoint}`,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data || error.message,
            status: error.response?.status || 500
        };
    }
};

// Test functions
const testHealthCheck = async () => {
    console.log('\n🏥 Testing Health Check...');
    const result = await apiRequest('GET', '/health');
    
    if (result.success) {
        console.log('✅ Health check passed');
        console.log(`   Status: ${result.data.status}`);
        console.log(`   Message: ${result.data.message}`);
    } else {
        console.log('❌ Health check failed:', result.error);
    }
    
    return result.success;
};

const testRegistration = async () => {
    console.log('\n📝 Testing User Registration...');
    const result = await apiRequest('POST', '/auth/register', TEST_USER);
    
    if (result.success) {
        console.log('✅ Registration successful');
        console.log(`   User ID: ${result.data.data.id}`);
        console.log(`   Email: ${result.data.data.email}`);
    } else if (result.status === 409) {
        console.log('ℹ️  User already exists (expected for repeated tests)');
        return true; // This is OK for testing
    } else {
        console.log('❌ Registration failed:', result.error);
    }
    
    return result.success || result.status === 409;
};

const testLogin = async () => {
    console.log('\n🔐 Testing User Login...');
    const result = await apiRequest('POST', '/auth/login', {
        email: TEST_USER.email,
        password: TEST_USER.password
    });
    
    if (result.success) {
        authToken = result.data.data.token;
        console.log('✅ Login successful');
        console.log(`   Token received: ${authToken.substring(0, 20)}...`);
        console.log(`   User: ${result.data.data.user.first_name} ${result.data.data.user.last_name}`);
        return true;
    } else {
        console.log('❌ Login failed:', result.error);
        return false;
    }
};

const testCreateTask = async () => {
    console.log('\n📋 Testing Task Creation...');
    const taskData = {
        title: 'Test Task for API Testing',
        description: 'This is a test task created by the API testing script',
        priority: 'high',
        status: 'pending',
        estimated_hours: 5,
        tags: ['testing', 'api', 'development']
    };

    const result = await apiRequest('POST', '/tasks', taskData, authToken);
    
    if (result.success) {
        createdTaskId = result.data.data.id;
        console.log('✅ Task created successfully');
        console.log(`   Task ID: ${createdTaskId}`);
        console.log(`   Title: ${result.data.data.title}`);
        console.log(`   Priority: ${result.data.data.priority}`);
        console.log(`   Tags: ${result.data.data.tags.join(', ')}`);
        return true;
    } else {
        console.log('❌ Task creation failed:', result.error);
        return false;
    }
};

const testGetTasks = async () => {
    console.log('\n📋 Testing Get All Tasks...');
    const result = await apiRequest('GET', '/tasks', null, authToken);
    
    if (result.success) {
        console.log('✅ Tasks retrieved successfully');
        console.log(`   Total tasks: ${result.data.data.tasks.length}`);
        console.log(`   Current page: ${result.data.data.pagination.current_page}`);
        console.log(`   Total pages: ${result.data.data.pagination.total_pages}`);
        
        if (result.data.data.tasks.length > 0) {
            const firstTask = result.data.data.tasks[0];
            console.log(`   First task: "${firstTask.title}" (${firstTask.status})`);
        }
        
        return true;
    } else {
        console.log('❌ Get tasks failed:', result.error);
        return false;
    }
};

const testGetTaskById = async () => {
    if (!createdTaskId) {
        console.log('\n⏭️  Skipping Get Task by ID (no task created)');
        return true;
    }

    console.log('\n🎯 Testing Get Task by ID...');
    const result = await apiRequest('GET', `/tasks/${createdTaskId}`, null, authToken);
    
    if (result.success) {
        console.log('✅ Task retrieved successfully');
        console.log(`   ID: ${result.data.data.id}`);
        console.log(`   Title: ${result.data.data.title}`);
        console.log(`   Status: ${result.data.data.status}`);
        console.log(`   Created by: ${result.data.data.creator_email}`);
        return true;
    } else {
        console.log('❌ Get task by ID failed:', result.error);
        return false;
    }
};

const testUpdateTask = async () => {
    if (!createdTaskId) {
        console.log('\n⏭️  Skipping Update Task (no task created)');
        return true;
    }

    console.log('\n✏️  Testing Task Update...');
    const updateData = {
        status: 'in_progress',
        priority: 'urgent',
        description: 'Updated description by API test script',
        actual_hours: 2.5
    };

    const result = await apiRequest('PUT', `/tasks/${createdTaskId}`, updateData, authToken);
    
    if (result.success) {
        console.log('✅ Task updated successfully');
        console.log(`   Status: ${result.data.data.status}`);
        console.log(`   Priority: ${result.data.data.priority}`);
        console.log(`   Actual hours: ${result.data.data.actual_hours}`);
        return true;
    } else {
        console.log('❌ Task update failed:', result.error);
        return false;
    }
};

const testUpdateTaskStatus = async () => {
    if (!createdTaskId) {
        console.log('\n⏭️  Skipping Update Task Status (no task created)');
        return true;
    }

    console.log('\n🔄 Testing Task Status Update...');
    const result = await apiRequest('PATCH', `/tasks/${createdTaskId}/status`, 
        { status: 'completed' }, authToken);
    
    if (result.success) {
        console.log('✅ Task status updated successfully');
        console.log(`   New status: ${result.data.data.status}`);
        return true;
    } else {
        console.log('❌ Task status update failed:', result.error);
        return false;
    }
};

const testTaskStats = async () => {
    console.log('\n📊 Testing Task Statistics...');
    const result = await apiRequest('GET', '/tasks/stats', null, authToken);
    
    if (result.success) {
        console.log('✅ Task statistics retrieved successfully');
        const stats = result.data.data.overview;
        console.log(`   Total tasks: ${stats.total_tasks}`);
        console.log(`   Pending: ${stats.pending_tasks}`);
        console.log(`   In progress: ${stats.in_progress_tasks}`);
        console.log(`   Completed: ${stats.completed_tasks}`);
        console.log(`   Overdue: ${stats.overdue_tasks}`);
        return true;
    } else {
        console.log('❌ Task statistics failed:', result.error);
        return false;
    }
};

const testGetUserProfile = async () => {
    console.log('\n👤 Testing Get User Profile...');
    const result = await apiRequest('GET', '/auth/me', null, authToken);
    
    if (result.success) {
        console.log('✅ User profile retrieved successfully');
        console.log(`   Name: ${result.data.data.first_name} ${result.data.data.last_name}`);
        console.log(`   Email: ${result.data.data.email}`);
        console.log(`   Role: ${result.data.data.role}`);
        return true;
    } else {
        console.log('❌ Get user profile failed:', result.error);
        return false;
    }
};

const testFilterTasks = async () => {
    console.log('\n🔍 Testing Task Filtering...');
    const result = await apiRequest('GET', '/tasks?status=completed&priority=urgent&limit=5', 
        null, authToken);
    
    if (result.success) {
        console.log('✅ Task filtering successful');
        console.log(`   Filtered tasks: ${result.data.data.tasks.length}`);
        console.log(`   Filter applied: status=completed, priority=urgent`);
        return true;
    } else {
        console.log('❌ Task filtering failed:', result.error);
        return false;
    }
};

const testUnauthorizedAccess = async () => {
    console.log('\n🚫 Testing Unauthorized Access...');
    const result = await apiRequest('GET', '/tasks', null, null); // No token
    
    if (!result.success && result.status === 401) {
        console.log('✅ Unauthorized access properly blocked');
        console.log(`   Status: ${result.status}`);
        return true;
    } else {
        console.log('❌ Unauthorized access should have been blocked');
        return false;
    }
};

const cleanup = async () => {
    if (createdTaskId && authToken) {
        console.log('\n🧹 Cleaning up test data...');
        const result = await apiRequest('DELETE', `/tasks/${createdTaskId}`, null, authToken);
        
        if (result.success) {
            console.log('✅ Test task deleted successfully');
        } else {
            console.log('⚠️  Could not delete test task:', result.error);
        }
    }
};

// Main test runner
const runTests = async () => {
    console.log('🚀 Starting WorkFlow Pro API Tests');
    console.log(`📍 Testing API at: ${API_URL}`);
    console.log('=' .repeat(50));

    const tests = [
        { name: 'Health Check', fn: testHealthCheck },
        { name: 'User Registration', fn: testRegistration },
        { name: 'User Login', fn: testLogin },
        { name: 'Unauthorized Access', fn: testUnauthorizedAccess },
        { name: 'Get User Profile', fn: testGetUserProfile },
        { name: 'Create Task', fn: testCreateTask },
        { name: 'Get All Tasks', fn: testGetTasks },
        { name: 'Get Task by ID', fn: testGetTaskById },
        { name: 'Update Task', fn: testUpdateTask },
        { name: 'Update Task Status', fn: testUpdateTaskStatus },
        { name: 'Filter Tasks', fn: testFilterTasks },
        { name: 'Task Statistics', fn: testTaskStats }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const success = await test.fn();
            if (success) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.log(`❌ Test "${test.name}" threw an error:`, error.message);
            failed++;
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Cleanup
    await cleanup();

    // Results summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${passed + failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

    if (failed === 0) {
        console.log('\n🎉 All tests passed! WorkFlow Pro API is working correctly.');
    } else {
        console.log(`\n⚠️  ${failed} test(s) failed. Please check the server and database configuration.`);
    }

    console.log('\n💡 Next steps:');
    console.log('   1. Make sure your database is running and migrated');
    console.log('   2. Check your .env configuration');
    console.log('   3. Verify server.js is running without errors');
    console.log('   4. Test the frontend integration');
};

// Handle command line execution
if (require.main === module) {
    runTests().catch(error => {
        console.error('Test runner error:', error);
        process.exit(1);
    });
}

module.exports = {
    runTests,
    apiRequest,
    testHealthCheck,
    testLogin
};