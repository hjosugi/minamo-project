-module(kgm1_router).
-behaviour(gen_server).

-export([start_link/0, publish/2]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2, code_change/3]).

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

publish(RoomId, Frame) ->
    gen_server:cast(?MODULE, {publish, RoomId, Frame}).

init([]) ->
    {ok, #{rooms => #{}}}.

handle_call(_Request, _From, State) ->
    {reply, ok, State}.

handle_cast({publish, _RoomId, _Frame}, State) ->
    %% TODO: Fan out latest KGM1 frame and drop stale frames under backpressure.
    {noreply, State};
handle_cast(_Msg, State) ->
    {noreply, State}.

handle_info(_Info, State) ->
    {noreply, State}.

terminate(_Reason, _State) ->
    ok.

code_change(_OldVsn, State, _Extra) ->
    {ok, State}.
