const competingStacks = [];
const processingStacks = new Set();

function timesOverlap(requestA, requestB) {
    return (
        requestA.requestDate === requestB.requestDate &&
        requestA.startTime < requestB.endTime &&
        requestA.endTime > requestB.startTime
    );
}

function classroomsOverlap(requestA, requestB) {
    const roomsA = requestA.classroomIds || [];
    const roomsB = requestB.classroomIds || [];

    return roomsA.some(roomId => roomsB.includes(roomId));
}

function requestsCompete(requestA, requestB) {
    if (!timesOverlap(requestA, requestB)) {
        return false;
    }

    if (!classroomsOverlap(requestA, requestB)) {
        return false;
    }

    return true;
}

function createStack(request) {
    const stack = {
        stackId: Date.now() + Math.random(),
        requests: [],
        processing: false
    };

    stack.requests.push(request);

    competingStacks.push(stack);

    return stack;
}

function findCompetingStack(request) {
    return competingStacks.find(stack =>
        stack.requests.some(existingRequest =>
            requestsCompete(request, existingRequest)
        )
    );
}

function addRequest(request) {
    const existingStack = findCompetingStack(request);

    if (!existingStack) {
        return {
            competing: false,
            stack: null
        };
    }

    /*
     * If a request is already being processed,
     * keep it at index 0.
     */
    if (existingStack.processing && existingStack.requests.length > 0) {
        const currentRequest = existingStack.requests[0];

        existingStack.requests.push(request);

        /*
         * Sort ONLY the waiting requests.
         * The currently processing request stays at index 0.
         */
        const waitingRequests = existingStack.requests
            .slice(1)
            .sort((a, b) => {
                const priorityDifference =
                    Number(b.priority) - Number(a.priority);

                if (priorityDifference !== 0) {
                    return priorityDifference;
                }

                return new Date(a.createdAt) - new Date(b.createdAt);
            });

        existingStack.requests = [
            currentRequest,
            ...waitingRequests
        ];
    } else {
        /*
         * No request is currently processing.
         * Therefore the complete stack can be sorted.
         */
        existingStack.requests.push(request);

        existingStack.requests.sort((a, b) => {
            const priorityDifference =
                Number(b.priority) - Number(a.priority);

            if (priorityDifference !== 0) {
                return priorityDifference;
            }

            return new Date(a.createdAt) - new Date(b.createdAt);
        });
    }

    return {
        competing: true,
        stack: existingStack
    };
}

function removeRequest(stack, request) {
    if (!stack || !request) {
        return;
    }

    const index = stack.requests.indexOf(request);

    if (index !== -1) {
        stack.requests.splice(index, 1);
    }
}

function removeEmptyStack(stack) {
    if (!stack || stack.requests.length !== 0) {
        return;
    }

    const index = competingStacks.indexOf(stack);

    if (index !== -1) {
        competingStacks.splice(index, 1);
    }

    processingStacks.delete(stack);
}

async function processStack(stack, processor) {
    if (!stack || stack.processing) {
        return;
    }

    stack.processing = true;
    processingStacks.add(stack);

    try {
        while (stack.requests.length > 0) {

            /*
             * The request stays inside the stack while it is processing.
             * We only remove it after processing finishes.
             */

            const currentRequest = stack.requests[0];

            try {
                await processor(currentRequest);
            } catch (error) {
                if (currentRequest.reject) {
                    currentRequest.reject(error);
                }
            }

            removeRequest(stack, currentRequest);
        }
    } finally {
        stack.processing = false;
        processingStacks.delete(stack);

        removeEmptyStack(stack);
    }
}

function getActiveStacks() {
    return competingStacks;
}

module.exports = {
    requestsCompete,
    createStack,
    findCompetingStack,
    addRequest,
    removeRequest,
    removeEmptyStack,
    processStack,
    getActiveStacks
};